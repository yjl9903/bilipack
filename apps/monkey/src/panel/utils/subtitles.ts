import type { SubtitleAttachment } from '../../application/types';

export function subtitleKey(
  file: SubtitleAttachment,
  files: readonly SubtitleAttachment[]
): string {
  return files.some((subtitle) => subtitle.part > 1)
    ? `P${file.part} · ${file.language}`
    : file.language;
}
