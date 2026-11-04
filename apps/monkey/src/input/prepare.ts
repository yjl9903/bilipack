import { parseConfig, parseSrt, videoEntries, ValidationError, type Diagnostic } from 'bilipack';
import { requireFile } from './files';
import { prepareCovers, releaseCovers } from './cover';
import type { PreparationConditions, Prepared } from './types';
export async function prepare(
  raw: string,
  files: ReadonlyMap<string, File>,
  conditions: PreparationConditions
): Promise<Prepared> {
  const config = parseConfig(raw),
    diagnostics: Diagnostic[] = [];
  const add = (field: string, message: string) =>
    diagnostics.push({ field, code: 'preflight', message });
  const collect = (field: string, e: unknown) =>
    e instanceof ValidationError
      ? diagnostics.push(...e.diagnostics)
      : add(field, (e as Error).message);
  const entries = videoEntries(config);
  if (conditions.requireVideo && !entries.length) add('videos', '空白页面需要视频');
  const videos: Prepared['videos'] = entries.map((entry, index) => {
    const field = config.video ? 'video.file' : `videos[${index}].file`;
    let file = entry.file ? files.get(entry.file) : undefined;
    if (conditions.requireVideo) {
      if (!entry.file) add(field, '空白页面每个 P 都需要视频文件');
      else
        try {
          file = requireFile(files, entry.file, field);
        } catch (error) {
          collect(field, error);
        }
    }
    return { part: index + 1, path: entry.file, title: entry.title, file };
  });
  const subtitles: Prepared['subtitles'] = [];
  for (const [i, s] of (config.subtitles ?? []).entries()) {
    const field = `subtitles[${i}]`;
    try {
      const file = requireFile(files, s.file, `${field}.file`);
      if (!/\.srt$/i.test(s.file)) throw new Error('仅支持 SRT 字幕');
      const source = await file.text();
      parseSrt(source, field);
      subtitles.push({ part: s.part ?? 1, file, language: s.language, source });
    } catch (e) {
      collect(field, e);
    }
  }
  let covers: Prepared['covers'] = [];
  if (config.cover) {
    try {
      covers = await prepareCovers(config.cover, files);
    } catch (e) {
      collect('cover', e);
    }
  }
  if (diagnostics.length) {
    releaseCovers(covers);
    throw new ValidationError(diagnostics);
  }
  return { raw, config, videos, covers, subtitles };
}
