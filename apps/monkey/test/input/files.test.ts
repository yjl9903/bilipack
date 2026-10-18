import { it, expect } from 'vitest';
import { indexFiles } from '../../src/input/files';
import { file } from '../support/fixtures';
it('uses only the chosen root and requires its config', () => {
  expect(() => indexFiles([file('pack/nested/bilipack.toml')])).toThrow('根目录');
  expect(indexFiles([file('pack/bilipack.toml'), file('pack/sub/zh.srt')]).has('sub/zh.srt')).toBe(
    true
  );
  expect(() => indexFiles([file('pack/bilipack.toml'), file('other/a')])).toThrow('同一个根目录');
});

it('rejects normalized collisions', () =>
  expect(() => indexFiles([file('p/bilipack.toml'), file('p/a//b'), file('p/a/b')])).toThrow(
    '重复'
  ));
