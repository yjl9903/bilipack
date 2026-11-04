import type { Result } from '../workflow/types';
import type { Prepared } from '../input/types';
import type { Attachment, PanelStatus } from './types';
export function summarize(results: readonly Result[]): string {
  if (!results.length) return '暂无执行结果。';
  const status = executionStatus(results);
  if (status === 'completed') return '请检查投稿表单，确认后自行提交或保存。';
  if (status === 'error') return '操作未完成，请查看结果。';
  if (results.some((r) => r.skipReason)) return '部分项目未完成，含不支持的项目，请查看结果。';
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
    part: s.part,
    name: s.file.webkitRelativePath || s.file.name,
    source: s.source
  }));
  return [
    ...prepared.videos.flatMap((video) =>
      video.file
        ? [
            {
              type: 'video' as const,
              part: video.part,
              title: video.title,
              file: video.file,
              name: video.path!
            }
          ]
        : []
    ),
    ...prepared.covers.map((c) => ({
      type: 'cover' as const,
      cover: { ratio: c.ratio, source: c.source },
      url: c.url
    })),
    ...subtitles
  ];
}
