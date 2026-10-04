import { afterEach, expect, it, vi } from 'vitest';
import { reconcileTags, type TagControls } from '../src/bilibili/tags';

afterEach(() => vi.restoreAllMocks());

function setup(initial: string[]) {
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const state = { tags: [...initial] };
  const controls: TagControls = {
    read: () => [...state.tags],
    remove: vi.fn(async (index) => {
      state.tags.splice(index, 1);
    }),
    add: vi.fn(async (tag) => {
      state.tags.push(tag);
    }),
    pause: async (ms) => {
      now += ms;
    }
  };
  return { state, controls };
}

it('frees a full recommended slot before restoring the missing target', async () => {
  const target = Array.from({ length: 10 }, (_, i) => `目标${i}`);
  const { state, controls } = setup([...target.slice(0, 9), '风景']);
  await reconcileTags(target, controls, new AbortController().signal);
  expect(state.tags).toEqual(target);
  expect(controls.remove).toHaveBeenCalledExactlyOnceWith(9, '风景');
  expect(controls.add).toHaveBeenCalledExactlyOnceWith('目标9');
});

it('cleans recommendations arriving during add and during the stability window', async () => {
  const { state, controls } = setup(['保留']);
  let injected = false;
  controls.add = vi.fn(async (tag) => {
    state.tags.push(tag, '风景');
  });
  const pause = controls.pause;
  controls.pause = async (ms) => {
    await pause(ms);
    if (!injected && !state.tags.includes('风景') && state.tags.includes('补齐')) {
      injected = true;
      state.tags.push('风景');
    }
  };
  await reconcileTags(['保留', '补齐'], controls, new AbortController().signal);
  expect(state.tags).toEqual(['保留', '补齐']);
  expect(controls.remove).toHaveBeenCalledTimes(2);
  expect(controls.add).toHaveBeenCalledOnce();
});

it('recovers an input reset and removes duplicates without deleting wanted tags', async () => {
  const { state, controls } = setup(['保留', '保留']);
  controls.add = vi
    .fn()
    .mockRejectedValueOnce(new Error('输入被重置'))
    .mockImplementation(async (tag: string) => {
      state.tags.push(tag);
    });
  await reconcileTags(['保留', '补齐'], controls, new AbortController().signal);
  expect(state.tags).toEqual(['保留', '补齐']);
  expect(controls.remove).toHaveBeenCalledExactlyOnceWith(1, '保留');
  expect(controls.add).toHaveBeenCalledTimes(2);
});

it('stops persistent recommendation churn with an actionable mismatch', async () => {
  const { controls } = setup(['风景']);
  controls.remove = vi.fn(async () => {});
  await expect(
    reconcileTags(['目标'], controls, new AbortController().signal)
  ).rejects.toMatchObject({
    message: '标签经补偿重试仍未稳定',
    actual: ['风景']
  });
  expect(Date.now()).toBeGreaterThanOrEqual(23_000);
  expect(Date.now()).toBeLessThan(23_300);
});

it('stops immediately on context cancellation without retrying mutations', async () => {
  const { controls } = setup(['风景']);
  const controller = new AbortController();
  controls.remove = vi.fn(async () => {
    controller.abort();
  });
  await expect(reconcileTags(['目标'], controls, controller.signal)).rejects.toThrow();
  expect(controls.remove).toHaveBeenCalledOnce();
  expect(controls.add).not.toHaveBeenCalled();
});

it('tries the remaining targets when the first tag repeatedly fails acceptance', async () => {
  const { state, controls } = setup([]);
  controls.add = vi.fn(async (tag) => {
    await controls.pause(5000);
    if (tag === '失败') throw new Error('平台未接受');
    state.tags.push(tag);
  });
  controls.finish = vi.fn();
  await expect(
    reconcileTags(['失败', '后续一', '后续二'], controls, new AbortController().signal)
  ).rejects.toMatchObject({ actual: ['后续一', '后续二'] });
  expect(vi.mocked(controls.add).mock.calls.map(([tag]) => tag)).toEqual([
    '失败',
    '失败',
    '后续一',
    '后续二'
  ]);
  expect(controls.finish).toHaveBeenCalledOnce();
});

it('allows ten slow accepted tags and blurs only after the batch', async () => {
  const { state, controls } = setup([]);
  const expected = Array.from({ length: 10 }, (_, i) => `标签${i}`);
  controls.add = vi.fn(async (tag) => {
    await controls.pause(3500);
    state.tags.push(tag);
  });
  controls.finish = vi.fn(() => expect(state.tags).toEqual(expected));
  await reconcileTags(expected, controls, new AbortController().signal);
  expect(state.tags).toEqual(expected);
  expect(controls.add).toHaveBeenCalledTimes(10);
  expect(controls.finish).toHaveBeenCalledOnce();
});
