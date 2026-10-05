import { expect, it, vi } from 'vitest';
import { run } from '../src/workflow/run';
import type { Step } from '../src/workflow/types';
import { context, mockAdapter } from './helpers';

it('uses declared waiting, completion association and retry policies with arbitrary IDs', async () => {
  const assign = vi.fn(async () => {}),
    editor = vi.fn(async () => {}),
    field = vi.fn(async () => {}),
    observe = vi.fn(async () => {});
  const steps: Step[] = [
    {
      id: 'assign-source',
      role: 'target' as const,
      dependsOn: [],
      retry: 'execute',
      pendingCompletion: {
        step: 'observe-source',
        verifiedMessage: 'source ready',
        unverifiedMessage: 'source not ready'
      },
      execute: assign,
      verify: () => ({ matches: false, message: 'assigned' })
    },
    {
      id: 'usable-form',
      role: 'condition' as const,
      dependsOn: ['assign-source'],
      retry: 'execute',
      execute: editor,
      verify: () => ({ matches: true, message: 'usable' })
    },
    {
      id: 'write-value',
      role: 'target' as const,
      dependsOn: ['usable-form'],
      execute: field,
      verify: () => ({ matches: true, message: 'matches' })
    },
    {
      id: 'observe-source',
      role: 'condition' as const,
      dependsOn: ['usable-form'],
      retry: 'execute',
      allowDuringSubmission: true,
      execute: observe,
      verify: () => ({ matches: true, message: 'ready' })
    }
  ];
  const c = context();
  const first = await run(steps, c);
  expect(first[0]).toMatchObject({ role: 'target', status: 'verified', message: 'source ready' });
  expect(first.map((r) => r.role)).toEqual(steps.map((s) => s.role));
  await run(steps, c, undefined, first);
  expect(assign).toHaveBeenCalledTimes(2);
  expect(editor).toHaveBeenCalledTimes(2);
  expect(observe).toHaveBeenCalledTimes(2);
  expect(field).toHaveBeenCalledOnce();
});

it('reports unresolved assignment from its declared completion step', async () => {
  const results = await run(
    [
      {
        id: 'assignment',
        role: 'target' as const,
        dependsOn: [],
        pendingCompletion: {
          step: 'confirmation',
          verifiedMessage: 'ready',
          unverifiedMessage: 'unknown'
        },
        execute: async () => {},
        verify: () => ({ matches: false, message: 'wait' })
      },
      {
        id: 'confirmation',
        role: 'condition' as const,
        dependsOn: ['assignment'],
        execute: async () => {},
        verify: () => ({ matches: false, message: 'not ready' })
      }
    ],
    context()
  );
  expect(results[0]).toMatchObject({ status: 'unverified', message: 'unknown' });
});

it('continues declared observation after an in-flight form operation fails in submission waiting', async () => {
  const adapter = mockAdapter({ stable: () => false });
  let page = adapter.context();
  adapter.context = () => page;
  const lateWrite = vi.fn(async () => {}),
    observe = vi.fn(async () => {});
  const results = await run(
    [
      {
        id: 'attachment',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {
          page = { ...page, submissionWaiting: true };
          throw new Error('停止附件写入');
        },
        verify: vi.fn()
      },
      {
        id: 'next-field',
        role: 'target' as const,
        dependsOn: [],
        execute: lateWrite,
        verify: vi.fn()
      },
      {
        id: 'independent-observation',
        role: 'condition' as const,
        dependsOn: [],
        allowDuringSubmission: true,
        execute: observe,
        verify: () => ({ matches: true, message: 'complete' })
      }
    ],
    context({}, adapter)
  );
  expect(results.map((r) => r.status)).toEqual(['failed', 'blocked', 'verified']);
  expect(lateWrite).not.toHaveBeenCalled();
  expect(observe).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'never resumes form operations after observation starts (submission: %s)',
  async (submission) => {
    const adapter = mockAdapter();
    let page = adapter.context();
    adapter.context = () => page;
    const lateWrite = vi.fn(async () => {});
    const lateRead = vi.fn(() => ({ matches: true, message: 'unused' }));
    const repair = vi.fn(async () => {});
    const results = await run(
      [
        {
          id: 'observe',
          role: 'condition',
          dependsOn: [],
          allowDuringSubmission: true,
          execute: async () => {
            page = { ...page, submissionWaiting: submission };
          },
          verify: () => ({ matches: false, message: '未确认视频完成' }),
          repair
        },
        {
          id: 'late-form',
          role: 'target',
          dependsOn: [],
          execute: lateWrite,
          verify: lateRead
        }
      ],
      context({}, adapter)
    );
    expect(results.map((r) => r.status)).toEqual(['unverified', 'blocked']);
    expect(lateWrite).not.toHaveBeenCalled();
    expect(lateRead).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  }
);
