import { it, expect } from 'vitest';

import { parseConfig, fieldTargets } from '../src';

it('preserves absence, explicit false, empty strings and lists', () => {
  const config = parseConfig('[info]\ntitle=""\ntags=[]\n[display]\nwatermark=false');
  expect(config.info).toEqual({ title: '', tags: [] });
  expect(config.display).toEqual({ watermark: false });
  expect(config.cover).toBeUndefined();
  expect(fieldTargets(config).map((t) => t.value)).toEqual(['', false, []]);
  expect(Object.isFrozen(config.display)).toBe(true);
});

it('applies defaults only inside an explicit cover', () => {
  expect(parseConfig('').cover).toBeUndefined();
  expect(parseConfig('[cover]\nfile="a.png"').cover).toEqual({
    mode: 'single',
    file: 'a.png',
    wide_position: [50, 50],
    standard_position: [50, 50]
  });
});

it('retains offset and instant', () => {
  const at = parseConfig('[publish]\nscheduled=true\nat=2026-10-05T18:00:00+08:00').publish!.at!;
  expect(at).toMatch(/\+08:00$/);
  expect(Date.parse(at)).toBe(Date.parse('2026-10-05T10:00:00Z'));
});

it.each([
  '[foo]\na=1',
  '[info]\ntitel="a"',
  '[info]\ntags=false',
  '[display]\nwatermark="false"',
  '[publish]\nscheduled=true',
  '[publish]\nscheduled=false\nat=2026-10-05T18:00:00Z',
  '[publish]\nat=2026-10-05T18:00:00',
  '[publish]\nat=2026-10-05',
  '[publish]\nat="2026-02-30T18:00:00Z"',
  '[publish]\nat=2026-02-30T18:00:00Z',
  '[publish]\nat="2026-10-05T24:00:00Z"',
  '[publish]\nat=2026-10-05T24:00:00Z',
  '[cover]\nfile="a"\nwide_position=[101,0]',
  '[cover]\nmode="dual"\nwide_file="a"',
  '[cover]\nfile="a"\nwide_file="b"',
  '[info]\ndeclaration="maybe"',
  '[display]\nvisibility="everyone"',
  '[[subtitles]]\nfile="a.srt"\nlanguage="中文"\n[[subtitles]]\nfile="b.srt"\nlanguage="中文"'
])('rejects invalid input %s', (source) => expect(() => parseConfig(source)).toThrow());

it('does not treat dates inside comments and multiline text as schedule values', () => {
  expect(
    parseConfig('# 2026-02-30\n[info]\ndescription = """\n2026-02-30\n"""').info?.description
  ).toBe('2026-02-30\n');
  expect(parseConfig('[publish]\nat=2028-02-29T18:00:00Z').publish?.at).toContain('2028-02-29');
});
