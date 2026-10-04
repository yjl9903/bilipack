import { FieldReadbackError, matchesContext } from './port';
import type { Result, RunContext, Step, Progress } from './types';

export async function run(
  steps: Step[],
  context: RunContext,
  onProgress?: (results: Result[], currentStep?: Progress) => void,
  previous?: readonly Result[]
): Promise<Result[]> {
  const results: Result[] = steps.map((step) => ({
    id: step.id,
    role: step.role,
    status: 'pending',
    message: '等待执行',
    expected: step.expected
  }));
  const priorResults = new Map(previous?.map((result) => [result.id, result]));
  const retryGroups = new Set(
    steps.flatMap((step) =>
      previous && step.group && priorResults.get(step.id)?.status !== 'verified'
        ? [step.group.id]
        : []
    )
  );
  const groups = new Map<string, Promise<void>>();
  const completed = new Set(
    steps
      .filter(
        (step) =>
          priorResults.get(step.id)?.status === 'verified' &&
          step.retry !== 'execute' &&
          !(step.group && retryGroups.has(step.group.id))
      )
      .map((step) => step.id)
  );
  let currentStep: Progress | undefined;
  const notify = () =>
    onProgress?.(
      results.map((result) => ({ ...result })),
      currentStep
    );
  const update = (id: string, patch: Partial<Result>) => {
    Object.assign(
      results.find((result) => result.id === id)!,
      patch
    );
    notify();
  };
  let submissionSeen = false;
  const submissionWaiting = () => {
    const page = context.adapter.context();
    const waiting =
      !!page.submissionWaiting && matchesContext(context.page, page) && page.count === 1;
    submissionSeen ||= waiting || !!context.page.submissionWaiting;
    return waiting;
  };
  const assert = () => {
    submissionWaiting();
    context.signal.throwIfAborted();
    context.adapter.assertContext(context.page);
  };
  const verify = async (step: Step) => {
    let evidence = await step.verify(context);
    assert();
    if (!evidence.matches && step.repair && !submissionWaiting()) {
      if (step.capability) {
        const capability = context.adapter.capability(step.capability.field, step.capability.value);
        if (!capability.available) throw new Error(capability.reason);
      }
      currentStep = { phase: 'repair', id: step.id };
      update(step.id, { status: 'running', message: '正在收敛目标并修复漂移' });
      await step.repair(context);
      assert();
      if (submissionWaiting()) throw new Error('已进入投稿等待，停止修复');
      evidence = await step.verify(context);
      assert();
    }
    return evidence;
  };
  notify();
  let interrupted = false;
  for (const step of steps) {
    const emit = (r: Omit<Result, 'id' | 'role'>) => update(step.id, r);
    if (interrupted) {
      emit({ status: 'blocked', message: '页面上下文不稳定，未执行后续操作' });
      continue;
    }
    try {
      assert();
    } catch (e) {
      interrupted = true;
      emit({ status: 'blocked', message: (e as Error).message });
      continue;
    }
    if (submissionWaiting() && !step.allowDuringSubmission) {
      emit({ status: 'blocked', message: '已进入投稿等待，未执行或核验本项' });
      continue;
    }
    if (step.skip) {
      emit({ status: 'skipped', message: step.skip });
      continue;
    }
    if (step.capability) {
      const capability = context.adapter.capability(step.capability.field, step.capability.value);
      if (!capability.available) {
        emit({
          status: 'skipped',
          skipReason: 'unsupported',
          message: capability.reason ?? '当前页面不支持，已跳过'
        });
        continue;
      }
    }
    if (step.dependsOn.some((id) => results.find((r) => r.id === id)?.skipReason)) {
      emit({
        status: 'skipped',
        skipReason: 'dependency',
        message: '依赖的项目不支持或已跳过，本项一并跳过'
      });
      continue;
    }
    if (
      step.dependsOn.some((id) => {
        const result = results.find((r) => r.id === id);
        // The plan may release dependents after assignment, before final completion evidence.
        return (
          !result ||
          (!['verified', 'skipped'].includes(result.status) &&
            !(steps.find((s) => s.id === id)?.pendingCompletion && result.status === 'waiting'))
        );
      })
    ) {
      emit({ status: 'blocked', message: '前置条件未完成' });
      continue;
    }
    try {
      if (!completed.has(step.id)) {
        currentStep = { phase: 'execute', id: step.id };
        emit({ status: 'running', message: '正在执行' });
        if (step.group) {
          const group = step.group;
          if (!groups.has(group.id)) groups.set(group.id, group.execute(context));
          await groups.get(group.id);
        } else await step.execute(context);
        assert();
      }
      if (submissionWaiting() && !step.allowDuringSubmission)
        throw new Error('已进入投稿等待，本项尚未确认');
      currentStep = { phase: 'verify', id: step.id };
      emit({ status: 'verifying', message: '正在读取页面结果' });
      const evidence = await verify(step);
      if (submissionWaiting() && !step.allowDuringSubmission)
        throw new Error('读回期间进入投稿等待，本项尚未确认');
      emit({
        status: evidence.matches ? 'verified' : step.pendingCompletion ? 'waiting' : 'unverified',
        expected: step.expected,
        actual: evidence.actual,
        message: evidence.message
      });
    } catch (e) {
      emit({
        status: 'failed',
        message: (e as Error).message,
        expected: step.expected,
        ...(e instanceof FieldReadbackError ? { actual: e.actual } : {})
      });
      // No attachment retries. Continue independent fields only with a stable page.
      try {
        assert();
        interrupted = !submissionWaiting() && !context.adapter.stable();
      } catch {
        interrupted = true;
      }
    }
  }
  // Read all applied targets again after uploads and dependent controls have settled.
  for (const result of results) {
    if (result.status !== 'verified') continue;
    const step = steps.find((s) => s.id === result.id)!;
    const verified = { ...result };
    const preserve = (message = '投稿前已核验') =>
      update(step.id, {
        ...verified,
        message: `${message}；${verified.message}`
      });
    if (submissionWaiting() && !step.allowDuringSubmission) {
      preserve();
      continue;
    }
    try {
      assert();
      currentStep = { phase: 'final-read', id: step.id };
      update(step.id, { status: 'verifying', message: '正在最终读回' });
      const evidence = await verify(step);
      if (submissionWaiting() && !step.allowDuringSubmission) {
        preserve();
        continue;
      }
      update(step.id, {
        status: evidence.matches ? 'verified' : 'unverified',
        actual: evidence.actual,
        message: evidence.message
      });
    } catch (e) {
      submissionWaiting();
      const page = context.adapter.context();
      const contextLost = context.signal.aborted || !matchesContext(context.page, page);
      if (
        contextLost ||
        (submissionSeen && !step.allowDuringSubmission && !step.pendingCompletion)
      ) {
        preserve(submissionSeen ? '投稿前已核验' : '此前已核验；页面变化后未重新核验');
        continue;
      }
      update(step.id, {
        status: 'unverified',
        message: (e as Error).message,
        ...(e instanceof FieldReadbackError ? { actual: e.actual } : {})
      });
    }
  }
  for (const step of steps) {
    if (!step.pendingCompletion) continue;
    const assigned = results.find((r) => r.id === step.id);
    if (assigned?.status !== 'waiting') continue;
    const completion = step.pendingCompletion;
    const verified = results.find((r) => r.id === completion.step)?.status === 'verified';
    update(step.id, {
      status: verified ? 'verified' : 'unverified',
      message: verified ? completion.verifiedMessage : completion.unverifiedMessage
    });
  }
  currentStep = undefined;
  notify();
  return results;
}
