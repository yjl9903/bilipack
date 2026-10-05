import { beforeEach, expect, it, vi } from 'vitest';
import { createBilibiliAdapter } from '../src/bilibili/adapter';
import { compare } from '../src/workflow/compare';
import { context } from './helpers';
import type { PageContext } from '../src/workflow/port';

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
