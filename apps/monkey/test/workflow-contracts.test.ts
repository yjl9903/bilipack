import { expect, it, vi } from 'vitest';
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import type { Progress, Result, Step, StepGroup } from '../src/workflow/types';
import { context, mockAdapter, cover } from './helpers';

it('keeps tag verification read-only and declares repair separately', async () => {
  const adapter = mockAdapter({
    verifyField: vi.fn(async () => ({ matches: false, message: '漂移' }))
  });
  const c = context({ config: { info: { tags: ['目标'] } } }, adapter);
  const step = plan(c.prepared, c.page).find((s) => s.id === 'info.tags')!;
  expect(await step.verify(c)).toMatchObject({ matches: false });
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(step.repair).toBeTypeOf('function');
});

it('reports an explicit repair phase when immediate tag verification fails', async () => {
  let tags = ['原有'];
  let writes = 0;
  const adapter = mockAdapter({
    applyField: vi.fn(async () => {
      tags = ++writes === 1 ? ['推荐'] : ['目标'];
    }),
    verifyField: vi.fn(async () => ({
      matches: tags.join() === '目标',
      actual: [...tags],
      message: '读回'
    }))
  });
  const c = context({ config: { info: { tags: ['目标'] } } }, adapter);
  const phases: Progress[] = [];
  const results = await run(plan(c.prepared, c.page), c, (_, progress) => {
    if (progress) phases.push(progress);
  });
  expect(adapter.applyField).toHaveBeenCalledTimes(2);
  expect(phases).toContainEqual({ phase: 'repair', id: 'info.tags' });
  expect(results.find((r) => r.id === 'info.tags')).toMatchObject({
    status: 'verified',
    actual: ['目标']
  });
});

it('does not repair after readback aborts the bound run', async () => {
  const abort = new AbortController();
  const adapter = mockAdapter({
    verifyField: vi.fn(async () => {
      abort.abort();
      return { matches: false, message: '漂移' };
    })
  });
  const c = { ...context({ config: { info: { tags: ['目标'] } } }, adapter), signal: abort.signal };
  await run(plan(c.prepared, c.page), c);
  expect(adapter.applyField).toHaveBeenCalledOnce();
});

it('shares a failed group operation without retrying it, and retries all members only on a new run', async () => {
  const execute = vi.fn<StepGroup['execute']>(async () => {
    throw new Error('第二个比例上传失败');
  });
  const group: StepGroup = { id: 'native-images', execute };
  // Unrelated IDs prove that the runner does not identify groups by cover prefixes.
  const verify = vi.fn(() => ({ matches: true, message: '重开读回' }));
  const steps: Step[] = ['wide-image', 'standard-image'].map((id) => ({
    id,
    role: 'target',
    dependsOn: [],
    group,
    verify
  }));
  const c = context();
  const failed = await run(steps, c);
  expect(execute).toHaveBeenCalledOnce();
  expect(failed.map((r) => r.status)).toEqual(['failed', 'failed']);
  expect(verify).not.toHaveBeenCalled();
  execute.mockImplementation(async () => {});
  const retried = await run(steps, c, undefined, [{ ...failed[0], status: 'verified' }, failed[1]]);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(retried.map((r) => r.status)).toEqual(['verified', 'verified']);
});

it('keeps separate evidence for each ratio when only one group member verifies', async () => {
  const adapter = mockAdapter({
    verifyCover: vi.fn(async (ratio) => ({
      matches: ratio === '16:9',
      actual: ratio,
      message: '读回'
    }))
  });
  const covers = (['4:3', '16:9'] as const).map((ratio) =>
    cover(ratio, 'cover.png', 'blob:preview')
  );
  const c = context({ covers }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(adapter.applyCovers).toHaveBeenCalledExactlyOnceWith(covers, c.signal, c.page);
  expect(results.find((r) => r.id === 'cover.4:3')).toMatchObject({ status: 'unverified' });
  expect(results.find((r) => r.id === 'cover.16:9')).toMatchObject({ status: 'verified' });
});

it('reapplies the whole group before readback when a previously skipped member becomes available', async () => {
  const operations: string[] = [];
  const group: StepGroup = {
    id: 'images',
    execute: async () => {
      operations.push('apply');
    }
  };
  const steps: Step[] = ['wide', 'standard'].map((id) => ({
    id,
    role: 'target',
    dependsOn: [],
    group,
    verify: () => {
      operations.push(id);
      return { matches: true, message: 'readback' };
    }
  }));
  const previous: Result[] = [
    { id: 'wide', role: 'target' as const, status: 'verified', message: 'ok' },
    {
      id: 'standard',
      role: 'target' as const,
      status: 'skipped',
      skipReason: 'unsupported',
      message: 'unavailable'
    }
  ];
  const results = await run(steps, context(), undefined, previous);
  expect(operations).toEqual(['apply', 'wide', 'standard']);
  expect(results.every((result) => result.status === 'verified')).toBe(true);
});

it.each([false, true])(
  'observes video completion independently after editor failure (submission: %s)',
  async (submission) => {
    const adapter = mockAdapter();
    let page: import('../src/workflow/port').PageContext = {
      ...adapter.context(),
      editor: false,
      video: 'uploading'
    };
    adapter.context = () => page;
    adapter.waitEditor = vi.fn(async () => {
      page = { ...page, submissionWaiting: submission };
      throw new Error('编辑表单未就绪');
    });
    const c = context({}, adapter);
    const results = await run(plan(c.prepared, c.page), c);
    expect(adapter.applyField).not.toHaveBeenCalled();
    expect(adapter.waitVideo).toHaveBeenCalledOnce();
    expect(results.find((result) => result.id === 'editor.ready')?.status).toBe('failed');
    expect(results.find((result) => result.id === 'info.title')?.status).toBe('blocked');
    expect(results.find((result) => result.id === 'video.ready')?.status).toBe('verified');
  }
);
