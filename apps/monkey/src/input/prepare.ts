import { parseConfig, parseSrt, ValidationError, type Diagnostic } from 'bilipack';
import { requireFile } from './files';
import { prepareCovers, releaseCovers } from './cover';
import type { PreparationConditions } from './types';
import type { Prepared } from './types';
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
  // Keep the local video available for preview even when the page already has a video.
  // Only the empty-page branch below requires or validates it for upload.
  let video: File | undefined = config.video ? files.get(config.video.file) : undefined;
  if (conditions.requireVideo) {
    if (!config.video) add('video.file', '空白页面需要视频');
    else
      try {
        video = requireFile(files, config.video.file, 'video.file');
      } catch (e) {
        collect('video.file', e);
      }
  }
  const subtitles: Prepared['subtitles'] = [];
  for (const [i, s] of (config.subtitles ?? []).entries()) {
    const field = `subtitles[${i}]`;
    try {
      const file = requireFile(files, s.file, `${field}.file`);
      if (!/\.srt$/i.test(s.file)) throw new Error('仅支持 SRT 字幕');
      const source = await file.text();
      parseSrt(source, field);
      subtitles.push({ file, language: s.language, source });
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
  return { raw, config, video, covers, subtitles };
}
