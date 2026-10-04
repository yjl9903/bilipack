import { parse } from 'smol-toml';
import { invalidBareDate, validCalendarDate } from './dates';

import { normalizePath } from '../paths';
import { ValidationError, type Diagnostic } from '../diagnostics';

import type { Config } from './types';

const schema: Record<string, Record<string, string>> = {
  video: { file: 'path' },
  cover: {
    mode: 'string',
    file: 'path',
    wide_file: 'path',
    standard_file: 'path',
    wide_position: 'position',
    standard_position: 'position'
  },
  info: {
    title: 'string',
    description: 'string',
    declaration: 'string',
    no_reprint: 'boolean',
    category: 'string',
    tags: 'strings',
    topic: 'string'
  },
  publish: { scheduled: 'boolean', at: 'date', collection: 'string' },
  display: { watermark: 'boolean', visibility: 'string', hide_from_profile: 'boolean' },
  commercial: { enabled: 'boolean' },
  media: { dolby_audio: 'boolean', hires_audio: 'boolean', panorama: 'boolean' },
  interaction: {
    dynamic: 'string',
    comments: 'boolean',
    danmaku: 'boolean',
    selected_comments: 'boolean'
  },
  subtitles: { file: 'path', language: 'string' }
};

const declarations = [
  '内容无需标注',
  '含AI生成内容',
  '含虚构演绎内容',
  '内容含营销信息',
  '个人观点，仅供参考',
  '内容为转载'
];

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

export function parseConfig(source: string): Readonly<Config> {
  const invalidDate = invalidBareDate(source);
  if (invalidDate)
    throw new ValidationError([
      { field: 'bilipack.toml', code: 'date', message: `无效日期：${invalidDate}` }
    ]);
  let raw: Record<string, unknown>;
  try {
    raw = parse(source) as Record<string, unknown>;
  } catch (error) {
    throw new ValidationError([{ field: 'bilipack.toml', code: 'toml', message: String(error) }]);
  }
  const errors: Diagnostic[] = [];
  const add = (field: string, message: string, code = 'config') =>
    errors.push({ field, code, message });
  function section(name: string, data: unknown, prefix = name) {
    if (!object(data)) {
      add(prefix, '必须是配置区块');
      return;
    }
    for (const [key, value] of Object.entries(data)) {
      const field = `${prefix}.${key}`,
        kind = schema[name][key];
      if (!Object.hasOwn(schema[name], key)) {
        add(field, '未知字段', 'unknown');
        continue;
      }
      if (kind === 'path') {
        if (typeof value !== 'string') add(field, '必须是文件相对路径');
        else
          try {
            data[key] = normalizePath(value);
          } catch (e) {
            add(field, (e as Error).message, 'path');
          }
      } else if (kind === 'position') {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          value.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100)
        )
          add(field, '必须是两个 0..100 的数值');
      } else if (kind === 'strings') {
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
          add(field, '必须是字符串数组');
        else if (new Set(value).size !== value.length) add(field, '不能包含重复标签');
      } else if (kind === 'date') {
        // TomlDate.toISOString preserves the original offset and local/offset distinction.
        const text = value instanceof Date ? value.toISOString() : value;
        if (
          typeof text !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}[Tt ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
            text
          ) ||
          !Number.isFinite(Date.parse(text)) ||
          !validCalendarDate(text)
        )
          add(field, '必须是包含时区的日期时间');
        else data[key] = text;
      } else if (typeof value !== kind) add(field, `必须是 ${kind}`);
    }
  }
  for (const [name, value] of Object.entries(raw)) {
    if (!Object.hasOwn(schema, name)) {
      add(name, '未知区块', 'unknown');
      continue;
    }
    if (name === 'subtitles') {
      if (!Array.isArray(value)) {
        add(name, '必须使用 [[subtitles]] 数组');
        continue;
      }
      const languages = new Set();
      value.forEach((s, i) => {
        const prefix = `subtitles[${i}]`;
        section(name, s, prefix);
        if (object(s)) {
          if (!s.file) add(`${prefix}.file`, '缺少字幕路径');
          if (typeof s.language !== 'string' || !s.language.trim())
            add(`${prefix}.language`, '缺少字幕语言');
          else if (languages.has(s.language)) add(`${prefix}.language`, '同语言字幕重复');
          else languages.add(s.language);
        }
      });
    } else section(name, value);
  }
  if (object(raw.video) && !raw.video.file) add('video.file', '缺少视频路径');
  if (object(raw.cover)) {
    const c = raw.cover;
    c.mode ??= 'single';
    if (c.mode === 'single') {
      if (!c.file) add('cover.file', '单图模式必须指定文件');
      if ('wide_file' in c || 'standard_file' in c) add('cover', '单图与双图字段不能混用');
      c.wide_position ??= [50, 50];
      c.standard_position ??= [50, 50];
    } else if (c.mode === 'dual') {
      if (!c.wide_file || !c.standard_file) add('cover', '双图模式必须提供两张封面');
      if (['file', 'wide_position', 'standard_position'].some((k) => k in c))
        add('cover', '双图不能使用单图或裁剪位置字段');
    } else add('cover.mode', '只支持 single 或 dual');
  }
  if (
    object(raw.info) &&
    'declaration' in raw.info &&
    !declarations.includes(raw.info.declaration as string)
  )
    add('info.declaration', '不支持的创作声明');
  if (
    object(raw.display) &&
    'visibility' in raw.display &&
    !['公开可见', '仅自己可见'].includes(raw.display.visibility as string)
  )
    add('display.visibility', '不支持的可见范围');
  if (object(raw.publish)) {
    const p = raw.publish;
    if (p.scheduled === true && !p.at) add('publish.at', '开启定时发布必须提供时间');
    if (p.scheduled === false && 'at' in p) add('publish.at', '关闭定时发布时不能指定时间');
  }
  if (errors.length) throw new ValidationError(errors);
  return freeze(raw) as Readonly<Config>;
}

function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
