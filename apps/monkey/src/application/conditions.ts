import { ValidationError, type Diagnostic } from 'bilipack';
import type { Prepared } from '../input/types';
import type { PageAdapter, PageContext } from '../workflow/port';

export function checkPageConditions(prepared: Prepared, page: PageContext, adapter: PageAdapter) {
  const diagnostics: Diagnostic[] = [];
  const add = (field: string, message: string) =>
    diagnostics.push({ field, code: 'preflight', message });
  if (!page.target) add('page', '尚未识别可操作的投稿表单');
  if (page.video === 'unknown' || page.video === 'failed')
    add('videos', '视频状态不明或失败，不会替换已有视频');
  if (page.count > 0 && prepared.videos.length && prepared.videos.length !== page.count)
    add('videos', '视频列表数量与页面分 P 数量不一致，不会追加、删除或替换视频');
  if (page.video === 'absent') {
    for (const video of prepared.videos) {
      const field = prepared.config.video ? 'video.file' : `videos[${video.part - 1}].file`;
      if (!video.file) add(field, '空白页面每个 P 都需要视频文件');
      else
        try {
          adapter.validateVideo(video.file);
        } catch (error) {
          add(field, (error as Error).message);
        }
    }
  }
  const count = page.video === 'absent' ? prepared.videos.length : page.count;
  for (const [index, subtitle] of (prepared.config.subtitles ?? []).entries()) {
    if (count > 1 && subtitle.part === undefined)
      add(`subtitles[${index}].part`, '多 P 字幕必须指定所属 part');
    else if ((subtitle.part ?? 1) > count)
      add(`subtitles[${index}].part`, '字幕所属 P 超出视频数量');
  }
  const config = prepared.config;
  if (
    config.publish?.at !== undefined &&
    config.publish.scheduled === undefined &&
    adapter.capability('publish.at', config.publish.at).available
  ) {
    try {
      if (adapter.readField('publish.scheduled') !== true)
        add('publish.at', '仅指定时间时，页面必须已启用定时发布');
    } catch (e) {
      add('publish.at', (e as Error).message);
    }
  }
  if (diagnostics.length) throw new ValidationError(diagnostics);
}
