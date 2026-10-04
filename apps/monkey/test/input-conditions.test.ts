import { expect, it, vi } from 'vitest';
import { prepare } from '../src/input/prepare';
import { createController } from '../src/application/controller';
import type { ViewState } from '../src/application/types';
import { file, mockAdapter } from './helpers';

it('prepares scheduling input without reading a page and takes explicit video requirements', async () => {
  const prepared = await prepare('[publish]\nat=2026-10-05T18:00:00Z', new Map(), {
    requireVideo: false
  });
  expect(Date.parse(prepared.config.publish!.at!)).toBe(Date.parse('2026-10-05T18:00:00Z'));
  await expect(prepare('', new Map(), { requireVideo: true })).rejects.toThrow('需要视频');
});

it.each(['video', 'schedule'] as const)(
  'checks %s page conditions before comparison or execution',
  async (condition) => {
    const adapter = mockAdapter({
      validateVideo: vi.fn(() => {
        throw new Error('页面不接受此格式');
      }),
      readField: vi.fn(() => false),
      verifyField: vi.fn()
    });
    let files: File[];
    if (condition === 'video') {
      adapter.context = () => ({
        identity: 'test',
        generation: 1,
        target: true,
        editor: false,
        count: 0,
        video: 'absent'
      });
      files = [file('pack/bilipack.toml', '[video]\nfile="video.bad"'), file('pack/video.bad')];
    } else files = [file('pack/bilipack.toml', '[publish]\nat=2026-10-05T18:00:00Z')];
    const controller = createController(adapter);
    let state!: ViewState;
    controller.subscribe((value) => {
      state = value;
    });
    await controller.importDirectory(async () => files);
    expect(state.panelStatus).toBe('error');
    expect(state.results[0].message).toContain(condition === 'video' ? '页面不接受' : '必须已启用');
    expect(adapter.verifyField).not.toHaveBeenCalled();
    expect(adapter.applyField).not.toHaveBeenCalled();
    expect(adapter.uploadVideo).not.toHaveBeenCalled();
    controller.dispose();
  }
);
