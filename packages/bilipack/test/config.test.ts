import { describe, expect, it } from 'vitest';
import { parseConfig, ValidationError, type Diagnostic } from '../src';

function diagnostics(source: string): Diagnostic[] {
  try {
    parseConfig(source);
    throw new Error('Expected invalid configuration');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).diagnostics;
  }
}

describe('configuration schema contracts', () => {
  it('normalizes every attachment path and preserves dual cover shape', () => {
    expect(
      parseConfig(`
[video]
file = "./视频//a.mp4"
[cover]
mode = "dual"
wide_file = "./封面//wide.png"
standard_file = "封面/./standard.png"
[[subtitles]]
file = "./字幕//zh.srt"
language = "中文"
`)
    ).toEqual({
      video: { file: '视频/a.mp4' },
      cover: { mode: 'dual', wide_file: '封面/wide.png', standard_file: '封面/standard.png' },
      subtitles: [{ file: '字幕/zh.srt', language: '中文' }]
    });
  });

  it('retains all explicit empty texts, lists and disabled switches without other defaults', () => {
    const config = parseConfig(`
subtitles = []
[info]
title = ""
description = ""
category = ""
topic = ""
no_reprint = false
tags = []
[publish]
scheduled = false
collection = ""
[display]
watermark = false
hide_from_profile = false
[commercial]
enabled = false
[media]
dolby_audio = false
hires_audio = false
panorama = false
[interaction]
dynamic = ""
comments = false
danmaku = false
selected_comments = false
`);
    expect(config).toEqual({
      subtitles: [],
      info: { title: '', description: '', category: '', topic: '', no_reprint: false, tags: [] },
      publish: { scheduled: false, collection: '' },
      display: { watermark: false, hide_from_profile: false },
      commercial: { enabled: false },
      media: { dolby_audio: false, hires_audio: false, panorama: false },
      interaction: { dynamic: '', comments: false, danmaku: false, selected_comments: false }
    });
    expect(parseConfig('')).toEqual({});
    expect(parseConfig('[info]\n[publish]')).toEqual({ info: {}, publish: {} });
  });

  it('recursively freezes objects, lists and crop coordinates', () => {
    const config = parseConfig(`
[cover]
file = "a.png"
[info]
tags = ["甲"]
[[subtitles]]
file = "a.srt"
language = "中文"
`);
    function assertFrozen(value: unknown) {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(assertFrozen);
      }
    }
    assertFrozen(config);
    expect(() => config.info!.tags!.push('乙')).toThrow();
    expect(() => (config.subtitles![0].language = '英语')).toThrow();
  });

  it.each(['video', 'cover', 'info', 'publish', 'display', 'commercial', 'media', 'interaction'])(
    'rejects unknown fields in %s with their field path',
    (group) => {
      expect(diagnostics(`[${group}]\nmisspelled = true`)).toContainEqual({
        field: `${group}.misspelled`,
        code: 'unknown',
        message: '未知字段'
      });
    }
  );

  it('reports each unknown key including indexed subtitles and unknown root sections', () => {
    expect(
      diagnostics(`
unknown = true
[info]
first = ""
second = ""
[[subtitles]]
file = "a.srt"
language = "中文"
extra = false
`)
    ).toEqual(
      expect.arrayContaining([
        { field: 'unknown', code: 'unknown', message: '未知区块' },
        { field: 'info.first', code: 'unknown', message: '未知字段' },
        { field: 'info.second', code: 'unknown', message: '未知字段' },
        { field: 'subtitles[0].extra', code: 'unknown', message: '未知字段' }
      ])
    );
  });

  it.each([
    ['video = []', 'video', '必须是配置区块'],
    ['subtitles = {}', 'subtitles', '必须使用 [[subtitles]] 数组'],
    ['subtitles = [1]', 'subtitles[0]', '必须是配置区块'],
    ['[video]', 'video.file', '缺少视频路径'],
    ['[[subtitles]]\nlanguage="中文"', 'subtitles[0].file', '缺少字幕路径'],
    ['[[subtitles]]\nfile="a.srt"', 'subtitles[0].language', '缺少字幕语言'],
    ['[[subtitles]]\nfile="a.srt"\nlanguage=" "', 'subtitles[0].language', '缺少字幕语言'],
    ['[info]\ntags=["a",1]', 'info.tags', '必须是字符串数组'],
    ['[info]\ntags=["a","a"]', 'info.tags', '不能包含重复标签'],
    [
      '[cover]\nfile="a"\nwide_position=[-1,101]',
      'cover.wide_position',
      '必须是两个 0..100 的数值'
    ],
    [
      '[cover]\nfile="a"\nstandard_position=[1,2,3]',
      'cover.standard_position',
      '必须是两个 0..100 的数值'
    ],
    [
      '[cover]\nfile="a"\nwide_position=[nan,inf]',
      'cover.wide_position',
      '必须是两个 0..100 的数值'
    ],
    ['[cover]', 'cover.file', '单图模式必须指定文件'],
    ['[cover]\nmode="dual"', 'cover', '双图模式必须提供两张封面'],
    ['[cover]\nmode="other"', 'cover.mode', '只支持 single 或 dual'],
    ['[cover]\nfile="a"\nstandard_file="b"', 'cover', '单图与双图字段不能混用'],
    [
      '[cover]\nmode="dual"\nwide_file="a"\nstandard_file="b"\nwide_position=[0,100]',
      'cover',
      '双图不能使用单图或裁剪位置字段'
    ],
    ['[info]\ndeclaration="不支持"', 'info.declaration', '不支持的创作声明'],
    ['[display]\nvisibility="everyone"', 'display.visibility', '不支持的可见范围'],
    ['[display]\nwatermark="false"', 'display.watermark', '必须是 boolean'],
    ['[info]\ntitle=123', 'info.title', '必须是 string'],
    ['[video]\nfile=123', 'video.file', '必须是文件相对路径'],
    ['[publish]\nscheduled=true', 'publish.at', '开启定时发布必须提供时间'],
    [
      '[publish]\nscheduled=false\nat="2026-10-05T18:00:00Z"',
      'publish.at',
      '关闭定时发布时不能指定时间'
    ]
  ])('retains Chinese diagnostics for %s', (source, field, message) => {
    expect(diagnostics(source)).toContainEqual({ field, code: 'config', message });
  });

  it('aggregates independent section errors with path diagnostic codes', () => {
    expect(
      diagnostics('[video]\nfile="../a"\n[info]\ntitle=false\n[display]\nwatermark=1')
    ).toEqual(
      expect.arrayContaining([
        { field: 'video.file', code: 'path', message: '路径不能包含 ..' },
        { field: 'info.title', code: 'config', message: '必须是 string' },
        { field: 'display.watermark', code: 'config', message: '必须是 boolean' }
      ])
    );
  });

  it('rejects repeated subtitle languages at the second entry without trimming valid language names', () => {
    const source =
      '[[subtitles]]\nfile="a.srt"\nlanguage="中文"\n[[subtitles]]\nfile="b.srt"\nlanguage="中文"';
    expect(diagnostics(source)).toContainEqual({
      field: 'subtitles[1].language',
      code: 'config',
      message: '同语言字幕重复'
    });
    expect(
      parseConfig(source.replace('language="中文"', 'language=" 中文 "')).subtitles![0].language
    ).toBe(' 中文 ');
  });

  it.each([
    '2028-02-29T18:00:00+08:00',
    '2026-10-05t18:00:00z',
    '2026-10-05 18:00:00-05:30',
    '2026-10-05T18:00:00.123456Z'
  ])('preserves accepted datetime string %s with no scheduled default', (at) => {
    expect(parseConfig(`[publish]\nat="${at}"`).publish).toEqual({ at });
  });

  it.each([
    '2026-02-29T18:00:00Z',
    '2100-02-29T18:00:00Z',
    '2026-04-31T18:00:00Z',
    '2026-10-05T18:60:00Z',
    '2026-10-05T18:00:60Z',
    '2026-10-05T18:00:00+24:00',
    '2026-10-05T18:00:00',
    '2026-10-05'
  ])('rejects invalid or timezone-free datetime %s', (at) => {
    expect(diagnostics(`[publish]\nat="${at}"`)).toContainEqual({
      field: 'publish.at',
      code: 'config',
      message: '必须是包含时区的日期时间'
    });
  });

  it('keeps TOML syntax and invalid bare calendar date diagnostic categories', () => {
    expect(diagnostics('[info')).toEqual([
      expect.objectContaining({ field: 'bilipack.toml', code: 'toml' })
    ]);
    expect(diagnostics('[publish]\nat=2026-02-30T18:00:00Z')).toEqual([
      { field: 'bilipack.toml', code: 'date', message: '无效日期：2026-02-30' }
    ]);
  });
});
