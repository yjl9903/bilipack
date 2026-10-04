import { expect, it } from 'vitest';
import { executionStatus, summarize } from '../src/application/presentation';
import type { Result } from '../src/workflow/types';

const result = (id: string, status: Result['status'], role: Result['role'] = 'target'): Result => ({
  id,
  role,
  status,
  message: ''
});
it('distinguishes complete, partial, unverifiable and failed writes', () => {
  expect(
    executionStatus([result('video.upload', 'skipped'), result('info.title', 'verified')])
  ).toBe('completed');
  expect(executionStatus([result('info.title', 'verified'), result('info.tags', 'failed')])).toBe(
    'attention'
  );
  expect(executionStatus([result('info.title', 'unverified')])).toBe('attention');
  expect(
    executionStatus([
      result('arbitrary-prerequisite', 'verified', 'condition'),
      result('arbitrary-observation', 'verified', 'condition'),
      result('info.title', 'failed')
    ])
  ).toBe('error');
  expect(executionStatus([result('video.upload', 'failed'), result('info.title', 'blocked')])).toBe(
    'error'
  );
});

it('keeps unsupported targets and their dependents visible as unfinished work', () => {
  const unsupported: Result = {
    id: 'publish.scheduled',
    role: 'target',
    status: 'skipped',
    skipReason: 'unsupported',
    message: '未接入'
  };
  const dependent: Result = {
    id: 'publish.at',
    role: 'target',
    status: 'skipped',
    skipReason: 'dependency',
    message: '依赖未接入'
  };
  expect(executionStatus([unsupported, dependent])).toBe('attention');
  expect(summarize([unsupported, dependent])).toContain('未完成项目');
  expect(executionStatus([result('info.title', 'verified'), unsupported])).toBe('attention');
});

it('does not describe editor checks alone as partial completion of failed writes', () => {
  const results = [
    result('arbitrary-prerequisite', 'verified', 'condition'),
    result('info.title', 'failed')
  ];
  expect(executionStatus(results)).toBe('error');
  expect(summarize(results)).not.toContain('部分完成');
});

it('counts declared targets even when their IDs used to name conditions', () => {
  expect(
    executionStatus([result('editor.ready', 'verified'), result('another-target', 'failed')])
  ).toBe('attention');
  expect(
    executionStatus([
      result('custom-target', 'verified'),
      result('custom-condition', 'failed', 'condition')
    ])
  ).toBe('attention');
});
