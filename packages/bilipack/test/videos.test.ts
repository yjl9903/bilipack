import { expect, it } from 'vitest';
import { parseConfig, videoEntries, ValidationError } from '../src';

it('preserves ordered parts, repeated names, whitespace, and legacy video input', () => {
  const config = parseConfig(`[[videos]]
file = "视频/1.mp4"
title = " 原名 "
[[videos]]
file = "视频/2.mp4"
title = " 原名 "`);
  expect(videoEntries(config)).toEqual([
    { file: '视频/1.mp4', title: ' 原名 ' },
    { file: '视频/2.mp4', title: ' 原名 ' }
  ]);
  expect(Object.isFrozen(config.videos![0])).toBe(true);
  expect(videoEntries(parseConfig('[video]\nfile="v.mp4"'))).toEqual([{ file: 'v.mp4' }]);
  expect(videoEntries(parseConfig(''))).toEqual([]);
  expect(videoEntries(parseConfig('[[videos]]\n[[videos]]\ntitle="伴奏"'))).toEqual([
    {},
    { title: '伴奏' }
  ]);
});

it.each([
  'videos=[]',
  '[video]\nfile="a.mp4"\n[[videos]]\nfile="b.mp4"',
  '[[videos]]\ntitle=""',
  '[[videos]]\ntitle="  "',
  '[[videos]]\nfile="../v.mp4"',
  '[[videos]]\norder=2',
  '[[videos]]\n[[videos]]\n[[subtitles]]\nfile="a.srt"\nlanguage="中文"',
  '[[videos]]\n[[subtitles]]\npart=2\nfile="a.srt"\nlanguage="中文"'
])('rejects ambiguous or invalid video configuration: %s', (raw) => {
  expect(() => parseConfig(raw)).toThrow(ValidationError);
});

it.each([0, -1, 1.5])('rejects invalid subtitle part %s', (part) => {
  expect(() => parseConfig(`[[subtitles]]\npart=${part}\nfile="a.srt"\nlanguage="中文"`)).toThrow();
});

it('keys subtitle uniqueness by part and language, treating omitted part as P1', () => {
  const subtitle = (part: string) => `[[subtitles]]\n${part}\nfile="a.srt"\nlanguage="中文"\n`;
  expect(() => parseConfig(subtitle('part=1') + subtitle('part=2'))).not.toThrow();
  expect(() => parseConfig(subtitle('') + subtitle('part=1'))).toThrow('同语言字幕重复');
  expect(() => parseConfig(subtitle('part=2') + subtitle('part=2'))).toThrow('同语言字幕重复');
});
