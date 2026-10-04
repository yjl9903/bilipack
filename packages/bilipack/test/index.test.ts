import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseConfig, fieldTargets, normalizePath, parseSrt } from '../src';

describe('configuration', () => {
  it('parses every product example', () => {
    const doc = readFileSync(new URL('../../../docs/intent/README.md', import.meta.url), 'utf8');
    const examples = [...doc.matchAll(/```toml\n([\s\S]*?)```/g)];
    expect(examples.length).toBe(4);
    for (const [, source] of examples) expect(() => parseConfig(source)).not.toThrow();
  });
  it('preserves absence, explicit false, empty strings and lists', () => {
    const config = parseConfig('[info]\ntitle=""\ntags=[]\n[display]\nwatermark=false');
    expect(config.info).toEqual({ title: '', tags: [] });
    expect(config.display).toEqual({ watermark: false });
    expect(config.cover).toBeUndefined();
    expect(fieldTargets(config).map((t) => t.value)).toEqual(['', false, []]);
    expect(Object.isFrozen(config.display)).toBe(true);
  });
  it('writes tags after all fields which can rerender or recommend tags', () => {
    const targets = fieldTargets({
      info: { tags: ['目标'], category: '动画', title: '标题', description: '简介' },
      display: { watermark: false },
      interaction: { dynamic: '动态' }
    });
    expect(targets[0].field).toBe('info.category');
    expect(targets.at(-1)?.field).toBe('info.tags');
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
});
describe('paths and subtitles', () => {
  it.each(['/a', '../a', 'a/../b', 'C:/a', 'https://x/a', 'a\\b', '.', 'a\u0000b'])(
    'rejects %s',
    (path) => expect(() => normalizePath(path)).toThrow()
  );
  it('normalizes harmless components without fuzzy matching', () =>
    expect(normalizePath('./A//B.srt')).toBe('A/B.srt'));
  it('validates SRT and preserves multiline text', () => {
    expect(parseSrt('\uFEFF1\r\n00:00:00,100 --> 00:00:01,000\r\n甲\r\n乙')[0]).toEqual({
      start: 100,
      end: 1000,
      text: '甲\n乙'
    });
  });
  it.each([
    '',
    'a\n00:00:00,000 --> 00:00:01,000\nx',
    '1\n00:60:00,000 --> 00:61:00,000\nx',
    '1\n00:00:02,000 --> 00:00:01,000\nx',
    '1\n00:00:01,000 --> 00:00:02,000'
  ])('rejects malformed SRT', (source) => expect(() => parseSrt(source)).toThrow());
});

it('allows literal punctuation in relative filenames', () => {
  expect(normalizePath('封面 #1?.png')).toBe('封面 #1?.png');
});

it('does not treat dates inside comments and multiline text as schedule values', () => {
  expect(
    parseConfig('# 2026-02-30\n[info]\ndescription = """\n2026-02-30\n"""').info?.description
  ).toBe('2026-02-30\n');
  expect(parseConfig('[publish]\nat=2028-02-29T18:00:00Z').publish?.at).toContain('2028-02-29');
});
