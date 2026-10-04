import { ValidationError, type Diagnostic } from 'bilipack';
import type { Prepared } from '../input/types';
import type { PageAdapter, PageContext } from '../workflow/port';

export function checkPageConditions(prepared: Prepared, page: PageContext, adapter: PageAdapter) {
  const diagnostics: Diagnostic[] = [];
  const add = (field: string, message: string) =>
    diagnostics.push({ field, code: 'preflight', message });
  if (!page.target) add('page', '尚未识别可操作的投稿表单');
  if (page.count > 1) add('video', '首版不支持多 P');
  if (page.video === 'unknown' || page.video === 'failed')
    add('video', '视频状态不明或失败，不会替换已有视频');
  if (page.video === 'absent' && prepared.video) {
    try {
      adapter.validateVideo(prepared.video);
    } catch (error) {
      add('video.file', (error as Error).message);
    }
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
