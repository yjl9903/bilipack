import { expect, it, vi } from 'vitest';
import { prepare } from '../../src/input/prepare';
import { checkPageConditions } from '../../src/application/conditions';
import { createTestController } from '../support/controller';
import { fakeAdapter } from '../support/page-adapter';
import { file } from '../support/fixtures';
import type { ViewState } from '../../src/application/types';
import { matchesContext } from '../../src/workflow/port';

it('requires each new video while preserving optional local previews on existing pages', async () => {
  const raw = '[[videos]]\nfile="one.mp4"\n[[videos]]\ntitle="two"';
  const files = new Map([['one.mp4', file('p/one.mp4')]]);
  await expect(prepare(raw, files, { requireVideo: true })).rejects.toThrow('每个 P');
  const prepared = await prepare(raw, files, { requireVideo: false });
  expect(prepared.videos.map((video) => [video.part, video.file?.name, video.title])).toEqual([
    [1, 'one.mp4', undefined],
    [2, undefined, 'two']
  ]);
});

it('compares and renames only P2 without uploading or modifying the main title', async () => {
  const names = ['one', 'two'];
  const adapter = fakeAdapter({
    readVideo: (part) => ({ title: names[part - 1], state: 'ready' }),
    renameVideo: vi.fn(async (part, title) => {
      names[part - 1] = title;
    })
  });
  const page = { ...adapter.context(), count: 2 };
  adapter.context = () => ({ ...page });
  const controller = createTestController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory(async () => [
    file('p/bilipack.toml', '[[videos]]\n[[videos]]\ntitle="伴奏"')
  ]);
  expect(state.results.find((r) => r.id === 'videos.2.title')).toMatchObject({
    status: 'different',
    actual: 'two',
    expected: '伴奏'
  });
  expect(names).toEqual(['one', 'two']);
  await controller.writeConfiguration();
  expect(names).toEqual(['one', '伴奏']);
  expect(adapter.renameVideo).toHaveBeenCalledOnce();
  expect(adapter.uploadVideos).not.toHaveBeenCalled();
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(state.panelStatus).toBe('completed');
  expect(adapter.waitVideo).toHaveBeenCalledTimes(2);
});

it.each(['[[videos]]\ntitle="one"', '[video]\nfile="one.mp4"'])(
  'rejects count mismatch before any page writes: %s',
  async (raw) => {
    const adapter = fakeAdapter();
    const page = { ...adapter.context(), count: 2 };
    adapter.context = () => page;
    const controller = createTestController(adapter);
    let state!: ViewState;
    controller.subscribe((value) => {
      state = value;
    });
    await controller.importDirectory(async () => [file('p/bilipack.toml', raw)]);
    expect(state.results[0].message).toContain('数量');
    expect(state.canWrite).toBe(false);
    expect(adapter.uploadVideos).not.toHaveBeenCalled();
    expect(adapter.renameVideo).not.toHaveBeenCalled();
    expect(adapter.applyField).not.toHaveBeenCalled();
  }
);

it('validates subtitle ownership against the page even when videos are omitted', async () => {
  const adapter = fakeAdapter();
  const page = { ...adapter.context(), count: 2 };
  for (const part of ['', 'part=3\n']) {
    const prepared = await prepare(
      `[[subtitles]]\n${part}file="a.srt"\nlanguage="中文"`,
      new Map([['a.srt', file('p/a.srt', '1\n00:00:00,000 --> 00:00:01,000\n字幕\n')]]),
      { requireVideo: false }
    );
    expect(() => checkPageConditions(prepared, page, adapter)).toThrow(/part|超出/);
  }
});

it('uploads ordered files once and reports each P, retaining unsupported subtitle ownership', async () => {
  const adapter = fakeAdapter({
    capability: (field) =>
      field === 'subtitles.parts'
        ? { available: false, reason: '多 P 字幕未接入' }
        : { available: true }
  });
  let page = { ...adapter.context(), count: 0, video: 'absent' as const } as ReturnType<
    typeof adapter.context
  >;
  adapter.context = () => ({ ...page });
  adapter.assertContext = (bound) => {
    if (!matchesContext(bound, page)) throw new Error('changed');
  };
  adapter.uploadVideos = vi.fn(async () => {
    page = { ...page, count: 2, video: 'uploading' };
  });
  adapter.verifyVideo = (part) => ({
    matches: part === 1,
    message: part === 1 ? 'done' : 'P2 未完成'
  });
  const controller = createTestController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory(async () => [
    file(
      'p/bilipack.toml',
      '[[videos]]\nfile="one.mp4"\ntitle="第一 P"\n[[videos]]\nfile="two.mp4"\n[[subtitles]]\npart=2\nfile="a.srt"\nlanguage="中文"'
    ),
    file('p/one.mp4'),
    file('p/two.mp4'),
    file('p/a.srt', '1\n00:00:00,000 --> 00:00:01,000\n字幕\n')
  ]);
  expect(adapter.uploadVideos).toHaveBeenCalledOnce();
  expect(vi.mocked(adapter.uploadVideos).mock.calls[0][0].map((f) => f.name)).toEqual([
    'one.mp4',
    'two.mp4'
  ]);
  expect(state.results.find((r) => r.id === 'videos.1.ready')?.status).toBe('verified');
  expect(state.results.find((r) => r.id === 'videos.2.ready')?.status).toBe('unverified');
  expect(state.results.find((r) => r.id === 'subtitles.P2.中文')).toMatchObject({
    status: 'skipped',
    skipReason: 'unsupported'
  });
  expect(adapter.applySubtitle).not.toHaveBeenCalled();
  expect(state.attachments.filter((a) => a.type === 'video').map((a) => a.part)).toEqual([1, 2]);
  expect(state.panelStatus).toBe('attention');
});

it('invalidates an existing multi-part binding after a structural change', async () => {
  const adapter = fakeAdapter();
  let page = { ...adapter.context(), count: 2 };
  adapter.context = () => page;
  const controller = createTestController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory(async () => [
    file('p/bilipack.toml', '[[videos]]\n[[videos]]\ntitle="two"')
  ]);
  page = { ...page, generation: page.generation + 1 };
  controller.updatePage(page);
  await controller.writeConfiguration();
  expect(state.canWrite).toBe(false);
  expect(state.panelStatus).toBe('interrupted');
  expect(adapter.renameVideo).not.toHaveBeenCalled();
});
