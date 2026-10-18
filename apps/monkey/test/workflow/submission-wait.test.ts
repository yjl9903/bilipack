import { expect, it, vi } from 'vitest';
import { run } from '../../src/workflow/run';
import { context } from '../support/run-context';
import { fakeAdapter } from '../support/page-adapter';
import type { Step } from '../../src/workflow/types';
it.each([false, true])(
  'preserves verified results on context loss even before waiting is recognized: %s',
  async (waiting) => {
    const adapter = fakeAdapter();
    let page = { ...adapter.context(), submissionWaiting: false };
    adapter.context = () => page;
    const abort = new AbortController();
    const ctx = { ...context({}, adapter), signal: abort.signal };
    const read = vi.fn(() => ({ matches: true, actual: '目标标题', message: '一致' }));
    const results = await run(
      [
        {
          id: 'info.title',
          role: 'target' as const,
          dependsOn: [],
          execute: async () => {},
          verify: read
        },
        {
          id: 'video.ready',
          role: 'condition',
          allowDuringSubmission: true,
          dependsOn: [],
          execute: async () => {
            page = { ...page, generation: page.generation + 1, submissionWaiting: waiting };
            abort.abort();
            abort.signal.throwIfAborted();
          },
          verify: () => ({ matches: false, message: '未确认上传完成' })
        }
      ],
      ctx
    );
    expect(results[0]).toMatchObject({ status: 'verified', actual: '目标标题' });
    expect(results[0].message).toBe('一致');
    expect(read).toHaveBeenCalledOnce();
    expect(results[1].status).not.toBe('verified');
  }
);

it('preserves prior evidence when context assertion fails before the lifecycle aborts', async () => {
  const adapter = fakeAdapter();
  let page = { ...adapter.context(), submissionWaiting: false };
  adapter.context = () => page;
  adapter.assertContext = (expected) => {
    if (expected.generation !== page.generation) throw new Error('稿件标识变化');
  };
  const read = vi.fn(() => ({ matches: true, actual: '目标标题', message: '一致' }));
  const ctx = context({}, adapter);
  const results = await run(
    [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {},
        verify: read
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: async () => {
          page = { ...page, generation: page.generation + 1, submissionWaiting: true };
        },
        verify: () => ({ matches: true, message: '不应调用' })
      }
    ],
    ctx
  );
  expect(ctx.signal.aborted).toBe(false);
  expect(results[0]).toMatchObject({ status: 'verified', actual: '目标标题' });
  expect(read).toHaveBeenCalledOnce();
  expect(results[1].status).not.toBe('verified');
});

it.each([true, false])(
  'preserves verified fields while separately checking upload: %s',
  async (ready) => {
    const adapter = fakeAdapter();
    let page = { ...adapter.context(), submissionWaiting: false };
    adapter.context = () => page;
    const verify = vi.fn(() => ({ matches: true, actual: '目标', message: '一致' }));
    const steps: Step[] = [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'cover.16:9',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'subtitles.中文',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: async () => {
          page = { ...page, submissionWaiting: true, editor: false };
        },
        verify: () => ({ matches: ready, message: '上传独立核验' })
      }
    ];
    const results = await run(steps, context({}, adapter));
    expect(verify).toHaveBeenCalledTimes(3);
    expect(results.slice(0, 3).map((r) => r.status)).toEqual(['verified', 'verified', 'verified']);
    expect(results.slice(0, 3).every((r) => r.message === '一致')).toBe(true);
    expect(results.at(-1)?.status).toBe(ready ? 'verified' : 'unverified');
  }
);

it('stops remaining form operations after the user queues submission', async () => {
  const adapter = fakeAdapter();
  let page = { ...adapter.context(), submissionWaiting: false };
  adapter.context = () => page;
  const laterWrite = vi.fn(async () => {}),
    laterRead = vi.fn(() => ({ matches: true, message: '' }));
  const results = await run(
    [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {
          page = { ...page, submissionWaiting: true };
        },
        verify: laterRead
      },
      {
        id: 'info.tags',
        role: 'target' as const,
        dependsOn: [],
        execute: laterWrite,
        verify: laterRead
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: (c) => adapter.waitVideo(c.signal, c.page),
        verify: adapter.verifyVideo
      }
    ],
    context({}, adapter)
  );
  expect(laterWrite).not.toHaveBeenCalled();
  expect(laterRead).not.toHaveBeenCalled();
  expect(results[0].status).toBe('failed');
  expect(results[1].status).toBe('blocked');
  expect(results[2].status).toBe('verified');
});
