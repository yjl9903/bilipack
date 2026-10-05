import { FieldReadbackError } from '../src/workflow/port';
import { expect, it, vi } from 'vitest';
import { compare } from '../src/workflow/compare';
import { context, mockAdapter, cover } from './helpers';

it('never uses write-verification evidence to claim existing attachments match local files', async () => {
  const adapter = mockAdapter({ verifyCover: vi.fn(), verifySubtitle: vi.fn() });
  const ctx = context(
    {
      config: {},
      covers: [cover('16:9', 'cover.png', 'blob:cover')],
      subtitles: [{ language: '中文', source: '', file: new File(['s'], 'zh.srt') }]
    },
    adapter
  );
  const results = await compare(ctx, vi.fn());
  expect(results.map((r) => [r.id, r.status])).toEqual([
    ['video.upload', 'skipped'],
    ['cover.16:9', 'unverified'],
    ['subtitles.中文', 'unverified']
  ]);
  expect(adapter.verifyCover).not.toHaveBeenCalled();
  expect(adapter.verifySubtitle).not.toHaveBeenCalled();
  expect(adapter.applyCovers).not.toHaveBeenCalled();
  expect(adapter.applySubtitle).not.toHaveBeenCalled();
});

it('keeps unreadable fields distinct from known differences', async () => {
  const adapter = mockAdapter({
    verifyField: vi.fn(async () => {
      throw new Error('控件隐藏');
    })
  });
  const results = await compare(context({}, adapter), vi.fn());
  expect(results[1]).toMatchObject({ id: 'info.title', status: 'unverified', expected: '目标' });
  expect(results[1].message).toContain('控件隐藏');
  expect(adapter.applyField).not.toHaveBeenCalled();
});

it('keeps current tags structured instead of duplicating them in the reason', async () => {
  const adapter = mockAdapter({
    verifyField: vi.fn(async () => {
      throw new FieldReadbackError('标签经补偿重试仍未稳定；标签输入被页面重置', ['旧标签']);
    })
  });
  const results = await compare(
    context({ config: { info: { tags: ['目标标签'] } } }, adapter),
    vi.fn()
  );
  expect(results[1]).toMatchObject({
    actual: ['旧标签'],
    expected: ['目标标签'],
    message: '暂无法比对：标签经补偿重试仍未稳定；标签输入被页面重置'
  });
});
