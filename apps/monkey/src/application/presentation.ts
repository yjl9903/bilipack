import type { Result } from '../workflow/types';
import type { Prepared } from '../input/types';
import type { Attachment, PanelStatus } from './types';
export function summarize(results: readonly Result[]): string {
  if (!results.length) return '暂无执行结果。';
  const status = executionStatus(results);
  if (status === 'completed') return '请检查投稿表单，确认后自行提交或保存。';
  if (status === 'error') return '操作未完成，请查看结果。';
  if (results.some((r) => r.skipReason))
    return '部分项目未完成，含不支持的项目，请查看结果。';
  return '部分项目未完成，请查看结果并处理。';
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
      name: c.source.file.name,
      size: c.source.file.size,
      kind: `本地目标封面 ${c.ratio}（非页面结果）`,
      url: c.url
    })),
    ...subtitles
  ];
}
