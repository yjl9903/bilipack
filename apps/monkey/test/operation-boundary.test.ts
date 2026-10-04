import { beforeEach, expect, it, vi } from 'vitest';
import { createBilibiliAdapter } from '../src/bilibili/adapter';
import { createOperation, waitFor, writeText, type Operation } from '../src/bilibili/operation';
import type { PageContext } from '../src/workflow/port';

const controls = vi.hoisted(() => ({ apply: vi.fn(), expand: vi.fn(), read: vi.fn() }));
vi.mock('../src/bilibili/fields', () => ({
  createFields: () => ({
    apply: controls.apply,
    expand: controls.expand,
    read: controls.read,
    supported: () => true
  }),
  matches: (field: string, actual: unknown, expected: unknown) => actual === expected
}));
vi.mock('../src/bilibili/cover', () => ({
  createCover: () => ({
    applyCovers: (files: unknown, operation: Operation) => controls.apply(files, operation)
  })
}));
vi.mock('../src/bilibili/subtitles', () => ({
  createSubtitles: () => ({
    applySubtitle: (language: string, file: File, operation: Operation) =>
      controls.apply(file, operation)
  })
}));
beforeEach(() => vi.clearAllMocks());
const initial = (): PageContext => ({
  identity: 'draft',
  generation: 1,
  target: true,
  editor: true,
  count: 1,
  video: 'ready'
});
const reader = (read: () => PageContext) =>
  Object.assign(read, { expectUpload: vi.fn(), cancelExpectedUpload: vi.fn() });

it.each(['field', 'covers', 'subtitle'] as const)(
  'stops %s writes within a long operation without waiting for lifecycle observation',
  async (kind) => {
    for (const change of [
      'identity',
      'generation',
      'submission',
      'abort',
      'missing',
      'multi'
    ] as const) {
      let page = initial();
      const bound = { ...page };
      const abort = new AbortController();
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let finish!: () => void;
      const paused = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const write = vi.fn();
      controls.apply.mockImplementation(async (_: unknown, operation: Operation) => {
        operation.write(write);
        entered();
        await paused;
        // Real operation primitives reject both stale writes and wait continuation.
        await waitFor(() => true, operation);
        operation.write(write);
      });
      const adapter = createBilibiliAdapter(
        document,
        reader(() => page)
      );
      const job =
        kind === 'field'
          ? adapter.applyField({ field: 'info.title', value: 'x' }, abort.signal, bound)
          : kind === 'covers'
            ? adapter.applyCovers([], abort.signal, bound)
            : adapter.applySubtitle('中文', new File(['srt'], 'zh.srt'), abort.signal, bound);
      const rejected = expect(job).rejects.toThrow();
      await started;
      if (change === 'identity') page = { ...page, identity: 'other' };
      if (change === 'generation') page = { ...page, generation: 2 };
      if (change === 'submission') page = { ...page, submissionWaiting: true };
      if (change === 'abort') abort.abort();
      if (change === 'missing') page = { ...page, count: 0 };
      if (change === 'multi') page = { ...page, count: 2 };
      finish();
      await rejected;
      expect(write).toHaveBeenCalledOnce();
    }
  }
);

it.each([0, 2])('rejects %s videos consistently at adapter and operation boundaries', (count) => {
  const page = { ...initial(), count };
  const adapter = createBilibiliAdapter(
    document,
    reader(() => page)
  );
  expect(() => adapter.assertContext(initial())).toThrow('稿件已变化');
  const operation = createOperation(() => page, initial(), new AbortController().signal);
  expect(() => operation.check()).toThrow('稿件已变化');
});

it('accepts the first video on the bound empty page at both boundaries', () => {
  const page = initial();
  const empty = { ...page, video: 'absent' as const, count: 0 };
  const adapter = createBilibiliAdapter(
    document,
    reader(() => page)
  );
  expect(() => adapter.assertContext(empty)).not.toThrow();
  const operation = createOperation(() => page, empty, new AbortController().signal);
  expect(() => operation.check()).not.toThrow();
});

it('continues independent video observation after stopping form writes, but rejects a different draft', async () => {
  let page = { ...initial(), submissionWaiting: true };
  const adapter = createBilibiliAdapter(
    document,
    reader(() => page)
  );
  const signal = new AbortController().signal;
  await expect(adapter.applyCovers([], signal, initial())).rejects.toThrow('投稿等待');
  await expect(adapter.waitVideo(signal, initial())).resolves.toBeUndefined();
  expect(signal.aborted).toBe(false);
  page = { ...page, identity: 'different' };
  await expect(adapter.waitVideo(signal, initial())).rejects.toThrow('稿件已变化');
});

it('allows submission observation but never permits writes through that operation', () => {
  const page = { ...initial(), submissionWaiting: true };
  const operation = createOperation(() => page, page, new AbortController().signal, true);
  expect(() => operation.check()).not.toThrow();
  const write = vi.fn();
  expect(() => operation.write(write)).toThrow('投稿等待');
  expect(write).not.toHaveBeenCalled();
});

it('checks between text events when a native listener changes the draft synchronously', () => {
  let page = initial();
  const operation = createOperation(() => page, page, new AbortController().signal);
  const input = document.createElement('input');
  document.body.append(input);
  const change = vi.fn();
  input.addEventListener('input', () => {
    page = { ...page, generation: 2 };
  });
  input.addEventListener('change', change);
  try {
    expect(() => writeText(input, 'value', operation)).toThrow('稿件已变化');
    expect(change).not.toHaveBeenCalled();
  } finally {
    input.remove();
  }
});

it('rejects a stale binding before invoking an attachment implementation', async () => {
  const adapter = createBilibiliAdapter(
    document,
    reader(() => ({ ...initial(), generation: 2 }))
  );
  await expect(adapter.applyCovers([], new AbortController().signal, initial())).rejects.toThrow(
    '稿件已变化'
  );
  expect(controls.apply).not.toHaveBeenCalled();
});

it('detects a page change within polling and leaves no further checks scheduled', async () => {
  vi.useFakeTimers();
  let page = initial();
  const operation = createOperation(() => page, page, new AbortController().signal);
  const read = vi.fn(() => undefined);
  try {
    const job = waitFor(read, operation, 5000, 20);
    const rejected = expect(job).rejects.toThrow('稿件已变化');
    page = { ...page, generation: 2 };
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    expect(read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('rejects upload at the platform boundary when an empty binding already has a video', async () => {
  const page = initial();
  const readContext = reader(() => page);
  const adapter = createBilibiliAdapter(document, readContext);
  const bound = { ...page, editor: false, video: 'absent' as const, count: 0 };
  await expect(
    adapter.uploadVideo(new File(['v'], 'v.mp4'), new AbortController().signal, bound)
  ).rejects.toThrow('已有视频');
  expect(readContext.expectUpload).not.toHaveBeenCalled();
});
