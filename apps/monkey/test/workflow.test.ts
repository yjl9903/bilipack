import { progressLabel } from '../src/panel/labels';
import { FieldReadbackError } from '../src/workflow/port';
import { describe, it, expect, vi } from 'vitest';
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import { summarize } from '../src/application/presentation';
import { mockAdapter, context, cover } from './helpers';
describe('workflow invariants', () => {
  it('retains step evidence without repairing tags changed after video completion', async () => {
    let actual: string[] = [];
    const a = mockAdapter({
      applyField: vi.fn(async (target) => {
        actual = [...(target.value as string[])];
      }),
      verifyField: async (target) => ({
        matches: JSON.stringify(actual) === JSON.stringify(target.value),
        actual: [...actual],
        message: 'readback'
      }),
      waitVideo: vi.fn(async () => {
        actual = ['保留', '风景'];
      })
    });
    const c = context({ config: { info: { tags: ['保留', '补齐'] } } }, a);
    const results = await run(plan(c.prepared, c.page), c);
    expect(actual).toEqual(['保留', '风景']);
    expect(a.applyField).toHaveBeenCalledOnce();
    expect(results.find((r) => r.id === 'info.tags')?.status).toBe('verified');
  });
  it('confirms both covers as one batch and verifies each ratio after applying', async () => {
    const covers = [
      cover('16:9', 'wide.png', 'blob:wide'),
      cover('4:3', 'standard.png', 'blob:standard')
    ];
    const a = mockAdapter({
      applyCovers: vi.fn(async () => {}),
      verifyCover: vi.fn(async () => ({ matches: true, message: 'readback' }))
    });
    const c = context({ covers }, a);
    const results = await run(plan(c.prepared, c.page), c);
    expect(a.applyCovers).toHaveBeenCalledExactlyOnceWith(covers, c.signal, c.page);
    expect(a.verifyCover).toHaveBeenCalledTimes(2);
    expect(results.filter((r) => r.id.startsWith('cover.')).map((r) => r.status)).toEqual([
      'verified',
      'verified'
    ]);
  });
  it.each(['ready', 'uploading'] as const)('never uploads when video is %s', async (video) => {
    const a = mockAdapter({
      context: () => ({ identity: 'x', generation: 1, target: true, editor: true, count: 1, video })
    });
    const c = context({}, a),
      results = await run(plan(c.prepared, c.page), c);
    expect(a.uploadVideo).not.toHaveBeenCalled();
    expect(a.waitVideo).toHaveBeenCalledOnce();
    expect(results[0].status).toBe('skipped');
    expect(a.applyField).toHaveBeenCalledOnce();
  });
  it('blocks all writes when the editor cannot be used', async () => {
    const a = mockAdapter({
        waitEditor: vi.fn(async () => {
          throw new Error('failed');
        })
      }),
      c = context({}, a);
    const results = await run(plan(c.prepared, c.page), c);
    expect(a.applyField).not.toHaveBeenCalled();
    expect(results.find((result) => result.id === 'info.title')?.status).toBe('blocked');
    expect(results.find((result) => result.id === 'video.ready')?.status).toBe('verified');
    expect(summarize(results)).not.toContain('确认后自行提交或保存');
  });
  it('stops after identity changes and never replays an attachment', async () => {
    let changed = false;
    const a = mockAdapter({
      applySubtitle: vi.fn(async () => {
        changed = true;
      }),
      assertContext: () => {
        if (changed) throw new Error('route changed');
      }
    });
    const c = context(
      {
        config: {},
        subtitles: [
          { language: '中文', source: '', file: new File(['s'], 'a.srt') },
          { language: '英语', source: '', file: new File(['s'], 'b.srt') }
        ]
      },
      a
    );
    const results = await run(plan(c.prepared, c.page), c);
    expect(a.applySubtitle).toHaveBeenCalledOnce();
    expect(results.find((result) => result.id === 'video.ready')?.status).toBe('blocked');
  });
  it('continues independent fields only when context is stable', async () => {
    const a = mockAdapter({
      applyField: vi.fn(async (t) => {
        if (t.field === 'info.title') throw new Error('unavailable');
      })
    });
    const c = context({ config: { info: { title: 'x', description: 'y' } } }, a);
    await run(plan(c.prepared, c.page), c);
    expect(a.applyField).toHaveBeenCalledTimes(2);
    const b = mockAdapter({
      applyField: vi.fn(async () => {
        throw new Error('modal stuck');
      }),
      stable: () => false
    });
    const d = context({ config: c.prepared.config }, b);
    await run(plan(d.prepared, d.page), d);
    expect(b.applyField).toHaveBeenCalledOnce();
  });
  it('keeps the immediate field evidence without reading it again at the end', async () => {
    const verifyField = vi.fn(async () => ({ matches: true, actual: '目标', message: 'readback' }));
    const a = mockAdapter({ verifyField });
    const c = context({}, a);
    const results = await run(plan(c.prepared, c.page), c);
    expect(verifyField).toHaveBeenCalledOnce();
    expect(results.find((result) => result.id === 'info.title')).toMatchObject({
      status: 'verified',
      actual: '目标',
      message: 'readback'
    });
  });
  it('treats a triggered upload as incomplete until actual video verification', async () => {
    const a = mockAdapter({
      context: () => ({
        identity: 'x',
        generation: 1,
        target: true,
        editor: false,
        count: 0,
        video: 'absent'
      }),
      verifyVideo: () => ({ matches: false, message: 'not complete' })
    });
    const c = context({ video: new File(['v'], 'v.mp4') }, a),
      r = await run(plan(c.prepared, c.page), c);
    expect(a.uploadVideo).toHaveBeenCalledOnce();
    expect(a.applyField).toHaveBeenCalledOnce();
    expect(r[0].status).toBe('unverified');
    expect(summarize(r)).not.toContain('确认后自行提交或保存');
  });
});

it('does not write a schedule time after its enabling switch fails', async () => {
  const a = mockAdapter({
    applyField: vi.fn(async () => {
      throw new Error('disabled');
    })
  });
  const c = context(
    { config: { publish: { scheduled: true, at: '2026-10-05T18:00:00+08:00' } } },
    a
  );
  const results = await run(plan(c.prepared, c.page), c);
  expect(a.applyField).toHaveBeenCalledOnce();
  expect(results.find((r) => r.id === 'publish.at')?.status).toBe('blocked');
});

it('reports pending, executing, readback, failures and blocked dependencies as they happen', async () => {
  const snapshots: { statuses: string[]; current?: string }[] = [];
  const c = context();
  const results = await run(
    [
      {
        id: 'good',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {},
        verify: () => ({ matches: true, message: 'ok' })
      },
      {
        id: 'bad',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {
          throw new Error('broken');
        },
        verify: () => ({ matches: true, message: 'unused' })
      },
      {
        id: 'dependent',
        role: 'target' as const,
        dependsOn: ['bad'],
        execute: vi.fn(),
        verify: () => ({ matches: true, message: 'unused' })
      }
    ],
    c,
    (results, current) =>
      snapshots.push({
        statuses: results.map((r) => r.status),
        current: current ? progressLabel(current) : undefined
      })
  );
  expect(snapshots[0].statuses).toEqual(['pending', 'pending', 'pending']);
  expect(snapshots).toContainEqual({
    statuses: ['running', 'pending', 'pending'],
    current: '正在执行：good'
  });
  expect(snapshots).toContainEqual({
    statuses: ['verifying', 'pending', 'pending'],
    current: '正在核验：good'
  });
  expect(results.map((r) => r.status)).toEqual(['verified', 'failed', 'blocked']);
  expect(snapshots.at(-1)?.current).toBeUndefined();
});

it.each([false, true])(
  'writes covers before tags and subtitles before waiting for video (upload fails: %s)',
  async (uploadFails) => {
    const operations: string[] = [];
    const a = mockAdapter({
      context: () => ({
        identity: 'x',
        generation: 1,
        target: true,
        editor: true,
        count: 1,
        video: 'uploading'
      }),
      waitEditor: vi.fn(async () => {
        operations.push('editor');
      }),
      applyField: vi.fn(async (target) => {
        operations.push(target.field);
      }),
      verifyField: async () => ({ matches: true, message: 'readback' }),
      applyCovers: vi.fn(async () => {
        operations.push('cover');
      }),
      applySubtitle: vi.fn(async () => {
        operations.push('subtitle');
      }),
      verifySubtitle: vi.fn(async () => {
        operations.push('subtitle-readback');
        return { matches: true, message: 'readback' };
      }),
      waitVideo: vi.fn(async () => {
        operations.push('upload-complete');
        if (uploadFails) throw new Error('upload failed');
      })
    });
    const c = context(
      {
        config: { info: { title: '目标', tags: ['标签'] } },
        covers: [cover('16:9', 'cover.png', 'blob:cover')],
        subtitles: [{ language: '中文', source: '', file: new File(['subtitle'], 'zh.srt') }]
      },
      a
    );
    const result = await run(plan(c.prepared, c.page), c);
    expect(operations).toEqual([
      'editor',
      'info.title',
      'cover',
      'info.tags',
      'subtitle',
      'subtitle-readback',
      'upload-complete'
    ]);
    expect(a.applySubtitle).toHaveBeenCalledOnce();
    expect(result.find((r) => r.id === 'subtitles.中文')?.status).toBe('verified');
    expect(result.find((r) => r.id === 'video.ready')?.status).toBe(
      uploadFails ? 'failed' : 'verified'
    );
    if (uploadFails) expect(summarize(result)).not.toContain('确认后自行提交或保存');
  }
);

it('retains readback values separately from execution failure reasons', async () => {
  const adapter = mockAdapter({
    applyField: vi.fn(async () => {
      throw new FieldReadbackError('标签尚未稳定', ['旧标签']);
    })
  });
  const c = context({ config: { info: { tags: ['目标标签'] } } }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(results.find((result) => result.id === 'info.tags')).toMatchObject({
    status: 'failed',
    message: '标签尚未稳定',
    actual: ['旧标签'],
    expected: ['目标标签']
  });
});

it('skips unsupported targets and their dependents while continuing supported fields and subtitle languages', async () => {
  const a = mockAdapter({
    capability: (field, value) => ({
      available:
        !['cover', 'media.hires_audio', 'commercial.enabled', 'publish.scheduled'].includes(
          field
        ) && !(field === 'subtitles' && value === '英语'),
      reason: '此项目未接入'
    })
  });
  const c = context(
    {
      config: {
        info: { title: '目标' },
        media: { hires_audio: true },
        commercial: { enabled: true },
        publish: { scheduled: true, at: '2026-10-05T18:00:00+08:00' }
      },
      covers: [cover('16:9', 'c.png', 'blob:c')],
      subtitles: [
        { language: '英语', source: '', file: new File(['en'], 'en.srt') },
        { language: '中文', source: '', file: new File(['zh'], 'zh.srt') }
      ]
    },
    a
  );
  const results = await run(plan(c.prepared, c.page), c);
  expect(a.applyField).toHaveBeenCalledExactlyOnceWith(
    { field: 'info.title', value: '目标' },
    c.signal,
    c.page
  );
  expect(a.applyCovers).not.toHaveBeenCalled();
  expect(a.applySubtitle).toHaveBeenCalledExactlyOnceWith(
    '中文',
    c.prepared.subtitles[1].file,
    c.signal,
    c.page
  );
  expect(results.find((r) => r.id === 'publish.at')).toMatchObject({
    status: 'skipped',
    skipReason: 'dependency'
  });
  expect(results.find((r) => r.id === 'subtitles.英语')).toMatchObject({
    status: 'skipped',
    skipReason: 'unsupported'
  });
  expect(results.some((r) => r.status === 'blocked' || r.status === 'failed')).toBe(false);
  expect(summarize(results)).toContain('含不支持的项目');
});

it('retries a partially failed cover group once without reuploading successful subtitles', async () => {
  const adapter = mockAdapter({ applyCovers: vi.fn(async () => {}) });
  const c = context(
    {
      config: {},
      covers: [cover('16:9', 'w.png', 'blob:w'), cover('4:3', 's.png', 'blob:s')],
      subtitles: [{ language: '中文', source: '', file: new File(['srt'], 'zh.srt') }]
    },
    adapter
  );
  const result = await run(plan(c.prepared, c.page), c, undefined, [
    { id: 'cover.16:9', role: 'target' as const, status: 'verified', message: 'ok' },
    { id: 'cover.4:3', role: 'target' as const, status: 'unverified', message: 'changed' },
    { id: 'subtitles.中文', role: 'target' as const, status: 'verified', message: 'ok' }
  ]);
  expect(adapter.applyCovers).toHaveBeenCalledOnce();
  expect(adapter.applySubtitle).not.toHaveBeenCalled();
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
  expect(
    result.filter((r) => r.id.startsWith('cover.')).every((r) => r.status === 'verified')
  ).toBe(true);
});
