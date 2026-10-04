import { ValidationError } from '../diagnostics';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export function parseSrt(source: string, field = 'subtitles'): Cue[] {
  const text = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const fail = (message: string): never => {
    throw new ValidationError([{ field, code: 'srt', message }]);
  };

  if (!text) fail('字幕不能为空');
  let previous = -1;
  return text.split(/\n[ \t]*\n/).map((block, i) => {
    const lines = block.split('\n');
    if (!/^\d+$/.test(lines[0])) fail(`第 ${i + 1} 段缺少序号`);
    const match =
      /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3}) --> (\d{2,}):([0-5]\d):([0-5]\d),(\d{3})\s*$/.exec(
        lines[1] ?? ''
      );
    if (!match) return fail(`第 ${i + 1} 段时间格式无效`);
    const time = (offset: number) =>
      Number(match[offset]) * 3600000 +
      Number(match[offset + 1]) * 60000 +
      Number(match[offset + 2]) * 1000 +
      Number(match[offset + 3]);
    const start = time(1),
      end = time(5),
      content = lines.slice(2).join('\n');
    if (start >= end || start < previous) fail(`第 ${i + 1} 段时间范围或顺序无效`);
    if (!content.trim()) fail(`第 ${i + 1} 段没有正文`);
    previous = start;
    return { start, end, text: content };
  });
}
