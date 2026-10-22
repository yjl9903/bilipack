import { expect, it, vi } from 'vitest';
import { plan } from '../../src/workflow/plan';
import { run } from '../../src/workflow/run';
import { fakeAdapter } from '../support/page-adapter';
import { context } from '../support/run-context';
import { compare } from '../../src/workflow/compare';

it.each([true, false])(
  'rechecks field capability after changing declaration (reprint: %s)',
  async (reprint) => {
    let changed = false;
    const adapter = fakeAdapter();
    const originalApply = adapter.applyField;
    adapter.applyField = vi.fn(async (target, signal, page) => {
      await originalApply(target, signal, page);
      if (target.field === 'info.declaration') changed = true;
    });
    adapter.capability = (field) => ({
      available: field !== 'display.watermark' || (changed ? !reprint : reprint),
      reason: '当前声明不支持水印'
    });
    const c = context(
      {
        config: {
          info: reprint
            ? { declaration: '内容为转载', source: 'https://example.com/video' }
            : { declaration: '内容无需标注' },
          display: { watermark: true }
        }
      },
      adapter
    );
    const compared = await compare(c, () => {});
    expect(compared.find((r) => r.id === 'display.watermark')?.status).toBe(
      reprint ? 'different' : 'skipped'
    );
    const results = await run(plan(c.prepared, c.page), c);
    expect(results.find((r) => r.id === 'display.watermark')).toMatchObject(
      reprint
        ? { status: 'skipped', skipReason: 'unsupported', expected: true }
        : { status: 'verified', actual: true }
    );
    expect(
      vi
        .mocked(adapter.applyField)
        .mock.calls.some(([target]) => target.field === 'display.watermark')
    ).toBe(!reprint);
    if (reprint)
      expect(results.find((r) => r.id === 'info.source')).toMatchObject({
        status: 'verified',
        actual: 'https://example.com/video'
      });
  }
);

it('blocks source, watermark and topic when declaration verification fails', async () => {
  const adapter = fakeAdapter({
    verifyField: async () => ({ matches: false, message: '声明未切换成功' })
  });
  const c = context(
    {
      config: {
        info: { declaration: '内容为转载', source: 'https://example.com/video', topic: '话题' },
        display: { watermark: false }
      }
    },
    adapter
  );
  const results = await run(plan(c.prepared, c.page), c);
  expect(adapter.applyField).toHaveBeenCalledOnce();
  for (const id of ['info.source', 'info.topic', 'display.watermark'])
    expect(results.find((r) => r.id === id)?.status).toBe('blocked');
});

it('updates a source alone without changing the declaration and reports mismatches', async () => {
  const adapter = fakeAdapter({
    verifyField: async () => ({ matches: false, actual: '旧来源', message: '来源未被接受' })
  });
  const c = context({ config: { info: { source: 'https://example.com/video' } } }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(adapter.applyField).toHaveBeenCalledExactlyOnceWith(
    { field: 'info.source', value: 'https://example.com/video' },
    c.signal,
    c.page
  );
  expect(results.find((r) => r.id === 'info.source')).toMatchObject({
    status: 'unverified',
    actual: '旧来源'
  });
});

it('skips unsupported capabilities without writing them', async () => {
  const adapter = fakeAdapter({ capability: () => ({ available: false, reason: 'unsupported' }) });
  const c = context({}, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(results.find((r) => r.id === 'info.title')).toMatchObject({
    status: 'skipped',
    skipReason: 'unsupported'
  });
  expect(adapter.applyField).not.toHaveBeenCalled();
});

it('passes configured values and subtitle languages to capability checks before writes', async () => {
  const capability = vi.fn((field: string, value?: unknown) => ({
    available: field !== 'subtitles' && value !== true,
    reason: 'unverified target'
  }));
  const adapter = fakeAdapter({ capability });
  const c = context(
    {
      config: { commercial: { enabled: true } },
      subtitles: [{ language: '中文', source: '', file: new File(['srt'], 'zh.srt') }]
    },
    adapter
  );
  const results = await run(plan(c.prepared, c.page), c);
  expect(results.filter((r) => r.skipReason).map((r) => r.id)).toEqual([
    'commercial.enabled',
    'subtitles.中文'
  ]);
  expect(capability).toHaveBeenCalledWith('commercial.enabled', true);
  expect(capability).toHaveBeenCalledWith('subtitles', '中文');
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(adapter.applySubtitle).not.toHaveBeenCalled();
});
