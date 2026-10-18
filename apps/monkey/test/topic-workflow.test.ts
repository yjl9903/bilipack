import { expect, it, vi } from 'vitest';
import { validateTagCapacity } from '../src/bilibili/tags';
import { matches } from '../src/bilibili/fields';
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import { context, mockAdapter } from './helpers';

function setup(tags: string[], topic = '') {
  const state = { tags: [...tags], topic };
  const read = (field: string) => (field === 'info.tags' ? [...state.tags] : state.topic);
  const adapter = mockAdapter({
    readField: read,
    applyField: vi.fn(async (target) => {
      if (target.field === 'info.tags') {
        validateTagCapacity(target.value, state.topic ? [state.topic] : []);
        state.tags = [...target.value];
      } else if (target.field === 'info.topic') {
        validateTagCapacity(state.tags, target.value ? [target.value] : []);
        state.topic = target.value;
      }
    }),
    verifyField: vi.fn(async (target) => ({
      matches: matches(target.field, read(target.field), target.value),
      actual: read(target.field),
      message: 'readback'
    }))
  });
  return { state, adapter };
}

const ten = Array.from({ length: 10 }, (_, index) => `标签${index}`);

it.each([
  { initial: ten, tags: ['标签0'], topic: '新话题', oldTopic: '' },
  { initial: ten, tags: [], topic: '新话题', oldTopic: '' },
  { initial: ['新话题', '标签0'], tags: ['标签0'], topic: '新话题', oldTopic: '' },
  { initial: ['旧标签'], tags: ['旧话题'], topic: '新话题', oldTopic: '旧话题' },
  { initial: ['旧标签'], tags: ten, topic: '', oldTopic: '旧话题' }
])('converges tags and topic in one run: $tags / $topic', async (input) => {
  const { state, adapter } = setup(input.initial, input.oldTopic);
  const c = context({ config: { info: { tags: input.tags, topic: input.topic } } }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(state).toEqual({ tags: input.tags, topic: input.topic });
  expect(
    results.filter((result) => result.role === 'target').map((result) => result.status)
  ).toEqual(['verified', 'verified']);
});

it('preserves ordinary tags when only a topic is configured, including capacity conflicts', async () => {
  const { state, adapter } = setup(ten);
  const c = context({ config: { info: { topic: '新话题' } } }, adapter);
  const results = await run(plan(c.prepared, c.page), c);
  expect(state).toEqual({ tags: ten, topic: '' });
  expect(results.find((result) => result.id === 'info.topic')).toMatchObject({
    status: 'failed',
    message: expect.stringContaining('10 个名额')
  });
  expect(adapter.applyField).toHaveBeenCalledOnce();
});

it('does not prune tags early when the topic already matches', async () => {
  const { state, adapter } = setup(['旧标签'], '话题');
  const c = context({ config: { info: { topic: '话题', tags: ['新标签'] } } }, adapter);
  await run(plan(c.prepared, c.page), c);
  expect(state).toEqual({ tags: ['新标签'], topic: '话题' });
  expect(vi.mocked(adapter.applyField).mock.calls.map(([target]) => target)).toEqual([
    { field: 'info.topic', value: '话题' },
    { field: 'info.tags', value: ['新标签'] }
  ]);
});

it.each(['unsupported', 'write', 'verify', 'cancel', 'context'])(
  'does not change the topic when tag preparation fails: %s',
  async (failure) => {
    const { state, adapter } = setup(['旧标签'], '旧话题');
    const c = context({ config: { info: { topic: '新话题', tags: [] } } }, adapter);
    const abort = new AbortController();
    c.signal = abort.signal;
    if (failure === 'unsupported')
      adapter.capability = (field) => ({ available: field !== 'info.tags' });
    if (failure === 'write')
      vi.mocked(adapter.applyField).mockRejectedValueOnce(new Error('清理失败'));
    if (failure === 'verify')
      vi.mocked(adapter.verifyField).mockResolvedValueOnce({ matches: false, message: '未清理' });
    if (failure === 'cancel' || failure === 'context') {
      vi.mocked(adapter.verifyField).mockImplementationOnce(async () => {
        if (failure === 'cancel') abort.abort();
        else
          adapter.assertContext = () => {
            throw new Error('稿件已变化');
          };
        return { matches: true, message: 'readback' };
      });
    }
    const results = await run(plan(c.prepared, c.page), c);
    expect(state.topic).toBe('旧话题');
    expect(
      vi.mocked(adapter.applyField).mock.calls.some(([target]) => target.field === 'info.topic')
    ).toBe(false);
    expect(results.find((result) => result.id === 'info.topic')?.status).toBe('failed');
  }
);
