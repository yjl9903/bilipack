import { prepare } from '../../src/input/prepare';
import { checkPageConditions } from '../../src/application/conditions';
import { context } from '../support/run-context';
import { expect, it, vi } from 'vitest';
import { createTestController } from '../support/controller';
import type { ViewState } from '../../src/application/types';
import { file } from '../support/fixtures';
import { fakeAdapter } from '../support/page-adapter';
it.each(['video', 'schedule'] as const)(
  'checks %s page conditions before comparison or execution',
  async (condition) => {
    const adapter = fakeAdapter({
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
    const controller = createTestController(adapter);
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

it('keeps a local video for preview without validating it for upload when the page already has one', async () => {
  const adapter = fakeAdapter();
  const video = file('pack/video.mp4');
  const prepared = await prepare('[video]\nfile="video.mp4"', new Map([['video.mp4', video]]), {
    requireVideo: false
  });
  checkPageConditions(prepared, adapter.context(), adapter);
  expect(prepared.video).toBe(video);
  expect(adapter.validateVideo).not.toHaveBeenCalled();
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
});

it('rejects unknown page video state before writes', () => {
  const c = context({ config: {} });
  expect(() => checkPageConditions(c.prepared, { ...c.page, video: 'unknown' }, c.adapter)).toThrow(
    '状态不明'
  );
  expect(c.adapter.uploadVideo).not.toHaveBeenCalled();
});

it('validates video support on an empty page before writes', () => {
  const adapter = fakeAdapter({
    validateVideo: vi.fn(() => {
      throw new Error('unsupported video');
    })
  });
  const c = context({ video: file('p/video.bad') }, adapter);
  expect(() =>
    checkPageConditions(c.prepared, { ...c.page, video: 'absent', count: 0 }, adapter)
  ).toThrow('unsupported video');
  expect(adapter.validateVideo).toHaveBeenCalledExactlyOnceWith(c.prepared.video);
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
  expect(adapter.applyField).not.toHaveBeenCalled();
});

it('requires the current page scheduling switch when only at is configured', () => {
  const adapter = fakeAdapter({ readField: () => false });
  const c = context({ config: { publish: { at: '2026-10-05T18:00:00Z' } } }, adapter);
  expect(() => checkPageConditions(c.prepared, c.page, adapter)).toThrow('必须已启用');
});
