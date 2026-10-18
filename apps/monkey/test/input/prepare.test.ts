import { file } from '../support/fixtures';
import { expect, it } from 'vitest';
import { prepare } from '../../src/input/prepare';
it('prepares scheduling input without reading a page and takes explicit video requirements', async () => {
  const prepared = await prepare('[publish]\nat=2026-10-05T18:00:00Z', new Map(), {
    requireVideo: false
  });
  expect(Date.parse(prepared.config.publish!.at!)).toBe(Date.parse('2026-10-05T18:00:00Z'));
  await expect(prepare('', new Map(), { requireVideo: true })).rejects.toThrow('需要视频');
});

it('does not require a configured video file when video input is optional', async () => {
  const prepared = await prepare('[video]\nfile="missing.mp4"', new Map(), { requireVideo: false });
  expect(prepared.video).toBeUndefined();
});

it('rejects missing or invalid subtitles during input preparation', async () => {
  const raw = '[[subtitles]]\nfile="zh.srt"\nlanguage="中文"';
  await expect(prepare(raw, new Map(), { requireVideo: false })).rejects.toThrow('不存在');
  await expect(
    prepare(raw, new Map([['zh.srt', file('p/zh.srt', 'bad')]]), {
      requireVideo: false
    })
  ).rejects.toThrow();
});
