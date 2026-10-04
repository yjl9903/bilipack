import { parse } from 'smol-toml';
import type { z } from 'zod';

import { invalidBareDate } from './dates';
import { configSchema } from './schema';
import { ValidationError, type Diagnostic } from '../diagnostics';
import type { Config } from './types';

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
  const result = configSchema.safeParse(raw, { reportInput: true });
  if (!result.success)
    throw new ValidationError(
      result.error.issues
        .flatMap(diagnostics)
        .filter(
          (diagnostic, index, all) =>
            all.findIndex(
              (other) =>
                other.field === diagnostic.field &&
                other.code === diagnostic.code &&
                other.message === diagnostic.message
            ) === index
        )
    );
  return freeze(result.data);
}

function fieldPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (field, key) =>
      typeof key === 'number' ? `${field}[${key}]` : `${field}${field ? '.' : ''}${String(key)}`,
    ''
  );
}

function diagnostics(issue: z.core.$ZodIssue): Diagnostic[] {
  if (issue.code === 'unrecognized_keys')
    return issue.keys.map((key) => ({
      field: fieldPath([...issue.path, key]),
      code: 'unknown',
      message: issue.path.length ? '未知字段' : '未知区块'
    }));
  const path = issue.path;
  const aggregate =
    (path[0] === 'info' && path[1] === 'tags') ||
    (path[0] === 'cover' && ['wide_position', 'standard_position'].includes(String(path[1])));
  const field = fieldPath(aggregate ? path.slice(0, 2) : path);
  // Missing required attachments retain the public diagnostic vocabulary.
  const missing = issue.code === 'invalid_type' && issue.input === undefined;
  let message = issue.message;
  if (missing && field === 'video.file') message = '缺少视频路径';
  if (missing && /^subtitles\[\d+\]\.file$/.test(field)) message = '缺少字幕路径';
  if (missing && /^subtitles\[\d+\]\.language$/.test(field)) message = '缺少字幕语言';
  return [
    {
      field: field || 'bilipack.toml',
      code: issue.code === 'custom' ? (issue.params?.diagnosticCode ?? 'config') : 'config',
      message
    }
  ];
}

function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
