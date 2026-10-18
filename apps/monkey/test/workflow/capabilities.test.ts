import { expect, it, vi } from 'vitest';
import { plan } from '../../src/workflow/plan';
import { run } from '../../src/workflow/run';
import { fakeAdapter } from '../support/page-adapter';
import { context } from '../support/run-context';

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
