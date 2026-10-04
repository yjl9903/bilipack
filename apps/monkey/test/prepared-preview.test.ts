import { expect, it, vi } from 'vitest';
import { createController } from '../src/application/controller';
import type { ViewState } from '../src/application/types';
import { file, mockAdapter } from './helpers';

it('uses the validated subtitle source for preview when any further file read would fail', async () => {
  const source = '1\n00:00:00,000 --> 00:00:01,000\n原文\n';
  const subtitle = file('pack/zh.srt', source);
  const read = vi
    .fn()
    .mockResolvedValueOnce(source)
    .mockRejectedValue(new Error('预览二次读取失败'));
  const selected = new File([source], 'zh.srt');
  Object.defineProperties(selected, {
    webkitRelativePath: { value: subtitle.webkitRelativePath },
    text: { value: read }
  });
  const adapter = mockAdapter();
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  try {
    await controller.importDirectory(async () => [
      file('pack/bilipack.toml', '[[subtitles]]\nlanguage="中文"\nfile="zh.srt"'),
      selected
    ]);
    expect(state.canWrite).toBe(true);
    expect(state.attachments.find((attachment) => attachment.type === 'subtitle')?.source).toBe(
      source
    );
    await controller.writeConfiguration();
    expect(adapter.applySubtitle).toHaveBeenCalledOnce();
    expect(state.results.find((r) => r.id === 'subtitles.中文')?.status).toBe('verified');
    expect(read).toHaveBeenCalledOnce();
  } finally {
    controller.dispose();
  }
});
