import { expect, it, vi } from 'vitest';
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import { compare } from '../src/workflow/compare';
import { executionStatus, presentAttachments } from '../src/application/presentation';
import { context, cover, mockAdapter } from './helpers';

it.each(['verified', 'failed', 'unverified'] as const)(
  'counts a new video once and preserves its target role when the title is %s',
  async (status) => {
    const adapter = mockAdapter({
      context: () => ({
        target: true,
        editor: false,
        video: 'absent',
        count: 0,
        identity: 'new',
        generation: 1
      }),
      applyField: vi.fn(async () => {
        if (status === 'failed') throw new Error('title failed');
      }),
      verifyField: async () => ({ matches: status === 'verified', message: 'readback' })
    });
    const c = context({ video: new File(['video'], 'video.mp4') }, adapter);
    adapter.uploadVideo = vi.fn(async () => {
      adapter.context = () => ({ ...c.page, video: 'uploading', count: 1 });
    });
    const snapshots: string[][] = [];
    const results = await run(plan(c.prepared, c.page), c, (results) => {
      snapshots.push(results.filter((r) => r.role === 'target').map((r) => r.id));
    });
    expect(results.filter((r) => r.role === 'target').map((r) => r.id)).toEqual([
      'video.upload',
      'info.title'
    ]);
    expect(results[0]).toMatchObject({ role: 'target', status: 'verified' });
    expect(results.at(-1)).toMatchObject({ role: 'condition', status: 'verified' });
    expect(snapshots.every((ids) => ids.join() === 'video.upload,info.title')).toBe(true);
    expect(executionStatus(results)).toBe(status === 'verified' ? 'completed' : 'attention');
  }
);

it('does not count existing video observations as completing failed targets', async () => {
  const adapter = mockAdapter({
    applyField: vi.fn(async () => {
      throw new Error('failed');
    })
  });
  const c = context({ video: new File(['video'], 'unused.mp4') }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(results[0]).toMatchObject({ role: 'condition', status: 'skipped' });
  expect(results.at(-1)).toMatchObject({ role: 'condition', status: 'verified' });
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
  expect(executionStatus(results)).toBe('error');
});

it.each([false, true])(
  'does not complete an unverified video with another completed target: %s',
  async (hasTitle) => {
    const adapter = mockAdapter({
      context: () => ({
        target: true,
        editor: false,
        video: 'absent',
        count: 0,
        identity: 'new',
        generation: 1
      }),
      verifyVideo: () => ({ matches: false, message: 'still uploading' })
    });
    const c = context(
      {
        config: hasTitle ? { info: { title: '目标' } } : {},
        video: new File(['video'], 'video.mp4')
      },
      adapter
    );
    adapter.uploadVideo = vi.fn(async () => {
      adapter.context = () => ({ ...c.page, video: 'uploading', count: 1 });
    });
    const results = await run(plan(c.prepared, c.page), c);
    expect(results[0]).toMatchObject({ role: 'target', status: 'verified' });
    expect(results.at(-1)).toMatchObject({ id: 'video.ready', status: 'unverified' });
    expect(executionStatus(results)).toBe('attention');
  }
);

it.each(['single', 'dual'] as const)(
  'keeps %s cover targets tied to their source files',
  async (mode) => {
    const c = context({
      config: {},
      covers: [cover('16:9', 'wide.png', ''), cover('4:3', 'standard.png', '')]
    });
    if (mode === 'single') {
      const source = new File(['original cover'], '我的封面.jpg', { type: 'image/jpeg' });
      for (const image of c.prepared.covers)
        image.source = { mode, file: source, width: 1600, height: 900, position: [50, 50] };
    }
    const expected =
      mode === 'single' ? ['我的封面.jpg', '我的封面.jpg'] : ['wide.png', 'standard.png'];
    const results = await run(plan(c.prepared, c.page), c);
    expect(results.filter((r) => r.role === 'target').map((r) => r.id)).toEqual([
      'cover.16:9',
      'cover.4:3'
    ]);
    expect(results.filter((r) => r.role === 'target').map((r) => r.expected)).toEqual(expected);
    expect(
      (await compare(c, vi.fn())).filter((r) => r.role === 'target').map((r) => r.expected)
    ).toEqual(expected);
    expect(presentAttachments(c.prepared).map((attachment) => attachment.name)).toEqual(expected);
    expect(c.adapter.applyCovers).toHaveBeenCalledOnce();
  }
);

it('classifies readonly field and attachment comparisons as targets without claiming a write', async () => {
  const adapter = mockAdapter({ verifyField: async () => ({ matches: true, message: 'matches' }) });
  const c = context(
    {
      covers: [cover('16:9', 'wide.png', '')],
      subtitles: [{ language: '中文', source: '', file: new File(['s'], 'zh.srt') }]
    },
    adapter
  );
  const results = await compare(c, vi.fn());
  expect(results[0]).toMatchObject({ id: 'video.upload', role: 'condition', status: 'skipped' });
  expect(results.slice(1).every((r) => r.role === 'target')).toBe(true);
  expect(results[1].message).toContain('尚未执行写入');
  expect(results.slice(2).map((r) => r.status)).toEqual(['unverified', 'unverified']);
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(executionStatus(results)).toBe('attention');
});

it('reports failed video assignment without counting blocked targets as completed', async () => {
  const adapter = mockAdapter({
    context: () => ({
      target: true,
      editor: false,
      video: 'absent',
      count: 0,
      identity: 'new',
      generation: 1
    }),
    uploadVideo: vi.fn(async () => {
      throw new Error('assignment failed');
    })
  });
  const c = context({ video: new File(['video'], 'video.mp4') }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(results[0]).toMatchObject({ role: 'target', status: 'failed' });
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(executionStatus(results)).toBe('error');
});
