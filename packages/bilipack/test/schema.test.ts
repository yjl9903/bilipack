import { describe, expect, it } from 'vitest';
import { parseConfig, fieldTargets, ValidationError, type Diagnostic } from '../src';

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
  it('preserves a reprint source verbatim and allows source-only updates', () => {
    const source = ' 转自 https://example.com/video，2026-10-22 ';
    for (const declaration of ['', '\ndeclaration="内容为转载"']) {
      const config = parseConfig(`[info]\nsource="${source}"${declaration}`);
      expect(config.info?.source).toBe(source);
      expect(fieldTargets(config)).toContainEqual({ field: 'info.source', value: source });
      expect(config.info?.declaration).toBe(declaration ? '内容为转载' : undefined);
    }
    expect(parseConfig('[info]\ntitle="标题"').info).not.toHaveProperty('source');
  });

  it('requires a nonempty source when explicitly selecting reprint', () => {
    expect(diagnostics('[info]\ndeclaration="内容为转载"')).toContainEqual({
      field: 'info.source',
      code: 'config',
      message: '内容为转载时必须提供转载来源'
    });
    for (const source of ['', '  '])
      expect(diagnostics(`[info]\ndeclaration="内容为转载"\nsource="${source}"`)).toContainEqual({
        field: 'info.source',
        code: 'config',
        message: '转载来源不能为空'
      });
    expect(diagnostics('[info]\nsource=123')).toContainEqual({
      field: 'info.source',
      code: 'config',
      message: '必须是 string'
    });
  });

  it.each([
    '内容无需标注',
    '含AI生成内容',
    '含虚构演绎内容',
    '内容含营销信息',
    '个人观点，仅供参考'
  ])(
    'rejects a source combined with %s without adding fields to that declaration',
    (declaration) => {
      expect(parseConfig(`[info]\ndeclaration="${declaration}"`)).toEqual({
        info: { declaration }
      });
      expect(
        diagnostics(`[info]\ndeclaration="${declaration}"\nsource="https://example.com"`)
      ).toContainEqual({
        field: 'info.source',
        code: 'config',
        message: '转载来源不能与非转载声明同时配置'
      });
    }
  );

  it('defaults collection update push only when a nonempty collection is configured', () => {
    const config = parseConfig('[publish]\ncollection="合集"');
    expect(config.publish).toEqual({ collection: '合集', collection_update_push: true });
    expect(fieldTargets(config)).toEqual([
      { field: 'publish.collection', value: '合集' },
      { field: 'publish.collection_update_push', value: true }
    ]);
    for (const source of ['', '[publish]', '[publish]\ncollection=""'])
      expect(
        fieldTargets(parseConfig(source)).some(
          (target) => target.field === 'publish.collection_update_push'
        )
      ).toBe(false);
  });

  it.each([true, false])(
    'preserves explicit collection update push %s and requires a collection',
    (value) => {
      expect(
        parseConfig(`[publish]\ncollection_update_push=${value}\ncollection="合集"`).publish
      ).toEqual({ collection: '合集', collection_update_push: value });
      for (const collection of ['', '\ncollection=""', '\ncollection="  "'])
        expect(
          diagnostics(`[publish]\ncollection_update_push=${value}${collection}`)
        ).toContainEqual({
          field: 'publish.collection_update_push',
          code: 'config',
          message: '配置合集更新推送必须指定非空合集'
        });
    }
  );

  it.each([
    ['info', 'no_reprint'],
    ['media', 'panorama']
  ])('rejects removed field %s.%s', (section, field) => {
    expect(diagnostics(`[${section}]\n${field}=false`)).toContainEqual({
      field: `${section}.${field}`,
      code: 'unknown',
      message: '未知字段'
    });
  });
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
[interaction]
dynamic = ""
comments = false
danmaku = false
selected_comments = false
`);
    expect(config).toEqual({
      subtitles: [],
      info: { title: '', description: '', category: '', topic: '', tags: [] },
      publish: { scheduled: false, collection: '' },
      display: { watermark: false, hide_from_profile: false },
      commercial: { enabled: false },
      media: { dolby_audio: false, hires_audio: false },
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
    [
      '[publish]\ncollection="合集"\ncollection_update_push="false"',
      'publish.collection_update_push',
      '必须是 boolean'
    ],
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
