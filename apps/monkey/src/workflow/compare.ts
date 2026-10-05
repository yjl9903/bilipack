import { FieldReadbackError } from './port';
import { fieldTargets } from 'bilipack';
import type { Result, RunContext, Progress } from './types';

/** Read current values only. Attachment verification after a write is not evidence
 * that an existing attachment matches a newly selected local file. */
export async function compare(
  context: RunContext,
  onProgress: (results: Result[], currentStep: Progress) => void
): Promise<Result[]> {
  const { adapter, prepared, signal, page } = context;
  const targets = fieldTargets(prepared.config);
  const fieldResults: Result[] = targets.map((target) => ({
    id: target.field,
    role: 'target',
    status: 'pending',
    expected: target.value,
    message: '等待比对'
  }));
  const results: Result[] = [
    ...(page.video !== 'absent'
      ? [
          {
            id: 'video.upload',
            role: 'condition' as const,
            status: 'skipped' as const,
            message: '页面已有视频，跳过视频上传'
          }
        ]
      : []),
    ...fieldResults
  ];
  const assert = () => {
    signal.throwIfAborted();
    adapter.assertContext(page);
  };
  const notify = (currentStep: Progress) =>
    onProgress(
      results.map((r) => ({ ...r })),
      currentStep
    );
  for (const [index, target] of targets.entries()) {
    assert();
    const result = fieldResults[index];
    result.status = 'verifying';
    result.message = '正在读取当前值';
    notify({ phase: 'compare', id: target.field });
    const capability = adapter.capability(target.field, target.value);
    if (!capability.available) {
      Object.assign(result, {
        status: 'skipped',
        skipReason: 'unsupported',
        message: capability.reason ?? '当前页面不支持此字段'
      });
    } else {
      try {
        const evidence = await adapter.verifyField(target, signal, page);
        assert();
        Object.assign(result, {
          status: evidence.matches ? 'verified' : 'different',
          actual: evidence.actual,
          message: evidence.matches
            ? '当前值与配置一致，尚未执行写入'
            : '当前值与配置不同，尚未执行写入'
        });
      } catch (error) {
        assert();
        Object.assign(result, {
          status: 'unverified',
          ...(error instanceof FieldReadbackError ? { actual: error.actual } : {}),
          message: `暂无法比对：${(error as Error).message}`
        });
      }
    }
    notify({ phase: 'compare', id: target.field });
  }
  for (const attachment of [
    ...prepared.covers.map((cover) => ({
      id: `cover.${cover.ratio}`,
      field: 'cover',
      expected: cover.source.file.name,
      value: prepared.config.cover
    })),
    ...prepared.subtitles.map((subtitle) => ({
      id: `subtitles.${subtitle.language}`,
      field: 'subtitles',
      expected: subtitle.file.name,
      value: subtitle.language
    }))
  ]) {
    assert();
    const capability = adapter.capability(attachment.field, attachment.value);
    results.push({
      id: attachment.id,
      role: 'target',
      expected: attachment.expected,
      status: capability.available ? 'unverified' : 'skipped',
      ...(!capability.available ? { skipReason: 'unsupported' as const } : {}),
      message: capability.available
        ? '尚未写入；无法仅凭当前页面确认本地附件与现有附件一致，写入后再核验'
        : (capability.reason ?? '当前页面不支持此附件')
    });
  }
  assert();
  notify({ phase: 'compared' });
  return results;
}
