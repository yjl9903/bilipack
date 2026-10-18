import { beforeEach, expect, it, vi } from 'vitest';
import { createBilibiliAdapter } from '../src/bilibili/adapter';
import { compare } from '../src/workflow/compare';
import { context } from './helpers';
import type { PageContext } from '../src/workflow/port';
import { subtitleLanguage } from '../src/bilibili/subtitles';

const fields = vi.hoisted(() => ({
  read: vi.fn(),
  expand: vi.fn(),
  apply: vi.fn(),
  supported: vi.fn(() => true)
}));
vi.mock('../src/bilibili/fields', async (original) => ({
  ...(await original<typeof import('../src/bilibili/fields')>()),
  createFields: () => fields
}));

beforeEach(() => vi.clearAllMocks());

function capabilityAdapter(editing = false) {
  const page: PageContext = {
    target: true,
    editor: true,
    video: 'ready',
    count: 1,
    generation: 1,
    identity: `https://member.bilibili.com/platform/upload/video/frame${editing ? '?type=edit' : ''}`
  };
  return createBilibiliAdapter(
    document,
    Object.assign(() => page, {
      expectUpload: vi.fn(),
      cancelExpectedUpload: vi.fn()
    })
  );
}

it('exposes verified fields while preserving edit-page restrictions', () => {
  const adapter = capabilityAdapter();
  for (const field of [
    'info.topic',
    'publish.at',
    'publish.collection',
    'publish.collection_update_push',
    'media.dolby_audio',
    'media.hires_audio',
    'commercial.enabled'
  ])
    expect(adapter.capability(field, true).available).toBe(true);
  for (const language of ['中文', '英语', '日语'])
    expect(adapter.capability('subtitles', language).available).toBe(true);
  expect(subtitleLanguage('英语')).toBe('English');
  expect(subtitleLanguage('日语')).toBe('日本語');
  expect(adapter.capability('subtitles', '未核查语言').available).toBe(false);
  const editing = capabilityAdapter(true);
  for (const field of [
    'publish.at',
    'publish.scheduled',
    'subtitles',
    'interaction.comments',
    'interaction.danmaku',
    'interaction.selected_comments'
  ])
    expect(editing.capability(field, '中文').available).toBe(false);
});

it('reports enabled commercial details as unfinished but verifies explicit disabling', async () => {
  const adapter = capabilityAdapter();
  const signal = new AbortController().signal;
  fields.read.mockReturnValue(true);
  expect(
    await adapter.verifyField(
      { field: 'commercial.enabled', value: true },
      signal,
      adapter.context()
    )
  ).toMatchObject({ matches: false, actual: true, message: expect.stringContaining('手动补充') });
  fields.read.mockReturnValue(false);
  expect(
    await adapter.verifyField(
      { field: 'commercial.enabled', value: false },
      signal,
      adapter.context()
    )
  ).toMatchObject({ matches: true, actual: false });
});

it('opens collapsed settings before comparing their fields without writing values', async () => {
  let expanded = false;
  fields.expand.mockImplementation(async () => {
    expanded = true;
  });
  fields.read.mockImplementation(() => {
    if (!expanded) throw new Error('找到 0 个控件');
    return false;
  });
  const readContext = Object.assign(
    (): PageContext => ({
      target: true,
      editor: true,
      video: 'ready',
      count: 1,
      identity: 'https://member.bilibili.com/platform/upload/video/frame',
      generation: 1
    }),
    { expectUpload: vi.fn(), cancelExpectedUpload: vi.fn() }
  );
  const adapter = createBilibiliAdapter(document, readContext);
  const results = await compare(
    context(
      { config: { display: { watermark: false }, interaction: { comments: false } } },
      adapter
    ),
    vi.fn()
  );
  expect(results.map((result) => result.status)).toEqual(['skipped', 'verified', 'verified']);
  expect(fields.expand.mock.invocationCallOrder[0]).toBeLessThan(
    fields.read.mock.invocationCallOrder[0]
  );
  expect(fields.apply).not.toHaveBeenCalled();
});

it('does not expand settings when comparing a basic field', async () => {
  fields.read.mockReturnValue('标题');
  const page: PageContext = {
    target: true,
    editor: true,
    identity: 'test',
    generation: 1,
    count: 1,
    video: 'ready'
  };
  const read = Object.assign(() => page, { expectUpload: vi.fn(), cancelExpectedUpload: vi.fn() });
  const adapter = createBilibiliAdapter(document, read);
  expect(
    await adapter.verifyField(
      { field: 'info.title', value: '标题' },
      new AbortController().signal,
      adapter.context()
    )
  ).toMatchObject({ matches: true });
  expect(fields.expand).not.toHaveBeenCalled();
});

it('preserves a real expansion failure instead of claiming a successful read', async () => {
  fields.expand.mockRejectedValue(new Error('更多设置不可操作'));
  const page: PageContext = {
    target: true,
    editor: true,
    identity: 'test',
    generation: 1,
    count: 1,
    video: 'ready'
  };
  const read = Object.assign(() => page, { expectUpload: vi.fn(), cancelExpectedUpload: vi.fn() });
  const adapter = createBilibiliAdapter(document, read);
  await expect(
    adapter.verifyField(
      { field: 'display.watermark', value: false },
      new AbortController().signal,
      adapter.context()
    )
  ).rejects.toThrow('更多设置不可操作');
  expect(fields.read).not.toHaveBeenCalled();
});

it('does not expand the page after comparison has been cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    createBilibiliAdapter().verifyField(
      { field: 'interaction.dynamic', value: '' },
      controller.signal,
      { target: true, editor: true, identity: 'test', generation: 1, count: 1, video: 'ready' }
    )
  ).rejects.toThrow();
  expect(fields.expand).not.toHaveBeenCalled();
  expect(fields.read).not.toHaveBeenCalled();
});
