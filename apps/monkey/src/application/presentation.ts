import type { Result } from '../workflow/types';
import type { Prepared } from '../input/types';
import type { Attachment, PanelStatus } from './types';
export function summarize(results: readonly Result[]): string {
  if (!results.length) return '未执行';
  const status = executionStatus(results);
  if (status === 'completed') return '本次准备完成，请检查原生表单并自行提交';
  if (status === 'error') return '未执行或执行中断；已保留页面现场';
  if (results.some((r) => r.skipReason))
    return '存在未完成项目；未支持或依赖未支持的项目已跳过，请查看校验结果。';
  return '存在未完成项目，请查看校验结果并处理；已保留现场';
}

export function executionStatus(results: readonly Result[]): PanelStatus {
  if (
    results.length &&
    results.every((r) => r.status === 'verified' || (r.status === 'skipped' && !r.skipReason))
  )
    return 'completed';
  const hasCompletedTarget = results.some((r) => r.role === 'target' && r.status === 'verified');
  if (!hasCompletedTarget && results.some((r) => r.status === 'failed' || r.status === 'blocked'))
    return 'error';
  return 'attention';
}

export function presentAttachments(prepared: Prepared): Attachment[] {
  const subtitles: Attachment[] = prepared.subtitles.map((s) => ({
    type: 'subtitle',
    language: s.language,
    name: s.file.webkitRelativePath || s.file.name,
    size: s.file.size,
    kind: `字幕 · ${s.language}`,
    source: s.source
  }));
  return [
    ...(prepared.video
      ? [
          {
            type: 'video' as const,
            file: prepared.video,
            name: prepared.config.video!.file,
            size: prepared.video.size,
            kind: '视频'
          }
        ]
      : []),
    ...prepared.covers.map((c) => ({
      type: 'cover' as const,
      cover: { ratio: c.ratio, source: c.source },
      name: c.file.name,
      size: c.file.size,
      kind: `本地目标封面 ${c.ratio}（非页面结果）`,
      url: c.url
    })),
    ...subtitles
  ];
}
