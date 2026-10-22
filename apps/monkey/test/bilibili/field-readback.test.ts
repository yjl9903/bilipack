import { beforeEach, expect, it, vi } from 'vitest';
import { createBilibiliAdapter } from '../../src/bilibili/adapter';
import type { PageContext } from '../../src/workflow/port';
import { subtitleLanguage } from '../../src/bilibili/subtitles';
const fields = vi.hoisted(() => ({
  read: vi.fn(),
  expand: vi.fn(),
  apply: vi.fn(),
  supported: vi.fn(() => true)
}));

vi.mock('../../src/bilibili/fields', async (original) => ({
  ...(await original<typeof import('../../src/bilibili/fields')>()),
  createFields: () => fields
}));

beforeEach(() => vi.resetAllMocks());

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

it.each([
  '内容无需标注',
  '含AI生成内容',
  '含虚构演绎内容',
  '内容含营销信息',
  '个人观点，仅供参考',
  '内容为转载'
])(
  'derives source, topic and watermark capabilities from the current declaration: %s',
  (declaration) => {
    fields.read.mockReturnValue(declaration);
    const adapter = capabilityAdapter();
    const reprint = declaration === '内容为转载';
    expect(adapter.capability('info.source').available).toBe(reprint);
    expect(adapter.capability('info.topic', '').available).toBe(!reprint);
    for (const value of [true, false])
      expect(adapter.capability('display.watermark', value).available).toBe(!reprint || !value);
    expect(adapter.capability('commercial.enabled', true).available).toBe(true);
    expect(adapter.capability('info.tags', []).available).toBe(true);
    fields.read.mockReturnValue(reprint ? '内容无需标注' : '内容为转载');
    expect(adapter.capability('info.source').available).toBe(!reprint);
    expect(adapter.capability('display.watermark', true).available).toBe(reprint);
    expect(adapter.capability('display.watermark', false).available).toBe(true);
  }
);

it('satisfies watermark false on reprints without accessing the hidden checkbox', async () => {
  fields.read.mockImplementation((field) => {
    if (field === 'info.declaration') return '内容为转载';
    throw new Error('不存在水印控件');
  });
  const adapter = capabilityAdapter();
  const target = { field: 'display.watermark', value: false } as const;
  const signal = new AbortController().signal;
  expect(adapter.readField(target.field)).toBe(false);
  await adapter.applyField(target, signal, adapter.context());
  expect(await adapter.verifyField(target, signal, adapter.context())).toMatchObject({
    matches: true,
    actual: false,
    message: expect.stringContaining('无需操作水印控件')
  });
  expect(fields.expand).not.toHaveBeenCalled();
  expect(fields.apply).not.toHaveBeenCalled();
  expect(fields.read.mock.calls.every(([field]) => field === 'info.declaration')).toBe(true);
});

it('rejects watermark true on reprints even if called directly', async () => {
  fields.read.mockReturnValue('内容为转载');
  const adapter = capabilityAdapter();
  const target = { field: 'display.watermark', value: true } as const;
  const signal = new AbortController().signal;
  expect(adapter.capability(target.field, target.value).available).toBe(false);
  await expect(adapter.applyField(target, signal, adapter.context())).rejects.toThrow(
    '不支持添加水印'
  );
  expect(await adapter.verifyField(target, signal, adapter.context())).toMatchObject({
    matches: false,
    actual: false
  });
  expect(fields.apply).not.toHaveBeenCalled();
});

it.each(['内容无需标注', undefined])(
  'does not turn a missing watermark control or unreadable declaration into false: %s',
  async (declaration) => {
    fields.read.mockImplementation((field) => {
      if (field === 'info.declaration' && declaration) return declaration;
      throw new Error('控件无法读取');
    });
    const adapter = capabilityAdapter();
    expect(() => adapter.readField('display.watermark')).toThrow('控件无法读取');
    await expect(
      adapter.verifyField(
        { field: 'display.watermark', value: false },
        new AbortController().signal,
        adapter.context()
      )
    ).rejects.toThrow('控件无法读取');
  }
);

it('does not infer declaration restrictions when the current declaration cannot be read', () => {
  fields.read.mockImplementation(() => {
    throw new Error('表单尚未就绪');
  });
  const adapter = capabilityAdapter();
  for (const field of ['info.source', 'info.topic', 'display.watermark'])
    expect(adapter.capability(field).available).toBe(true);
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
  fields.read.mockImplementation((field) => {
    if (field === 'info.declaration') return '内容无需标注';
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
  const signal = new AbortController().signal;
  const results = await Promise.all([
    adapter.verifyField({ field: 'display.watermark', value: false }, signal, adapter.context()),
    adapter.verifyField({ field: 'interaction.comments', value: false }, signal, adapter.context())
  ]);
  expect(results.map((result) => result.matches)).toEqual([true, true]);
  expect(fields.expand.mock.invocationCallOrder[0]).toBeLessThan(
    fields.read.mock.invocationCallOrder[
      fields.read.mock.calls.findIndex(([field]) => field === 'display.watermark')
    ]
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
  expect(fields.read).toHaveBeenCalledExactlyOnceWith('info.declaration');
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
