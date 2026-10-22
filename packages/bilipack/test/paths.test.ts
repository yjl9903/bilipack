import { it, expect } from 'vitest';

import { normalizePath } from '../src';

it.each(['/a', '../a', 'a/../b', 'C:/a', 'https://x/a', 'a\\b', '.', 'a\u0000b'])(
  'rejects %s',
  (path) => expect(() => normalizePath(path)).toThrow()
);

it('normalizes harmless components without fuzzy matching', () =>
  expect(normalizePath('./A//B.srt')).toBe('A/B.srt'));

it('allows literal punctuation in relative filenames', () => {
  expect(normalizePath('封面 #1?.png')).toBe('封面 #1?.png');
});
