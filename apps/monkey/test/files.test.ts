import { describe, it, expect, vi } from 'vitest';
import { indexFiles } from '../src/input/files';
import { cropRect } from '../src/input/cover';
import { pickDirectory } from '../src/input/picker';
import { prepare } from '../src/input/prepare';
import { checkPageConditions } from '../src/application/conditions';
import { coverPan } from '../src/bilibili/cover';
import type { PageAdapter, PageContext } from '../src/workflow/port';
// Integration helper preserves the previous preflight assertions across the two boundaries.
async function preflight(
  raw: string,
  files: ReadonlyMap<string, File>,
  page: PageContext,
  adapter: PageAdapter
) {
  const prepared = await prepare(raw, files, { requireVideo: page.video === 'absent' });
  checkPageConditions(prepared, page, adapter);
  return prepared;
}
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import { file, mockAdapter, context } from './helpers';
describe('package files and preflight', () => {
  it('uses only the chosen root and requires its config', () => {
    expect(() => indexFiles([file('pack/nested/bilipack.toml')])).toThrow('根目录');
    expect(
      indexFiles([file('pack/bilipack.toml'), file('pack/sub/zh.srt')]).has('sub/zh.srt')
    ).toBe(true);
    expect(() => indexFiles([file('pack/bilipack.toml'), file('other/a')])).toThrow('同一个根目录');
  });
  it('rejects normalized collisions', () =>
    expect(() => indexFiles([file('p/bilipack.toml'), file('p/a//b'), file('p/a/b')])).toThrow(
      '重复'
    ));
  it('does not require the configured video file when page has video', async () => {
    const a = mockAdapter();
    const p = await preflight('[video]\nfile="missing.mp4"', new Map(), a.context(), a);
    expect(p.video).toBeUndefined();
  });
  it('keeps a local video for preview when the page already has one', async () => {
    const validateVideo = vi.fn();
    const adapter = mockAdapter({ validateVideo });
    const video = file('pack/video.mp4');
    const prepared = await preflight(
      '[video]\nfile="video.mp4"',
      new Map([['video.mp4', video]]),
      adapter.context(),
      adapter
    );
    expect(prepared.video).toBe(video);
    expect(validateVideo).not.toHaveBeenCalled();
    expect(adapter.uploadVideo).not.toHaveBeenCalled();
  });
  it('requires a nonempty video on an empty page and rejects unknown states', async () => {
    const a = mockAdapter();
    await expect(
      preflight('', new Map(), { ...a.context(), video: 'absent', count: 0 }, a)
    ).rejects.toThrow('需要视频');
    await expect(preflight('', new Map(), { ...a.context(), video: 'unknown' }, a)).rejects.toThrow(
      '状态不明'
    );
  });
  it('skips unsupported capabilities without writing them', async () => {
    const a = mockAdapter({ capability: () => ({ available: false, reason: 'unsupported' }) });
    const p = await preflight('[info]\ntitle="a"', new Map(), a.context(), a);
    const results = await run(plan(p, a.context()), context(p, a));
    expect(results.find((r) => r.id === 'info.title')).toMatchObject({
      status: 'skipped',
      skipReason: 'unsupported'
    });
    expect(a.applyField).not.toHaveBeenCalled();
  });
  it('passes configured values and subtitle languages to capability checks before writes', async () => {
    const capability = vi.fn((field: string, value?: unknown) => ({
      available: field !== 'subtitles' && value !== true,
      reason: 'unverified target'
    }));
    const a = mockAdapter({ capability });
    const p = await preflight('[commercial]\nenabled=true', new Map(), a.context(), a);
    p.subtitles = [{ language: '中文', source: '', file: new File(['srt'], 'zh.srt') }];
    const results = await run(plan(p, a.context()), context(p, a));
    expect(results.filter((r) => r.skipReason).map((r) => r.id)).toEqual([
      'commercial.enabled',
      'subtitles.中文'
    ]);
    expect(capability).toHaveBeenCalledWith('commercial.enabled', true);
    expect(capability).toHaveBeenCalledWith('subtitles', '中文');
    expect(a.applyField).not.toHaveBeenCalled();
    expect(a.applySubtitle).not.toHaveBeenCalled();
  });
  it('rejects an unsupported video through adapter validation before any write', async () => {
    const a = mockAdapter({
      validateVideo: () => {
        throw new Error('unsupported video');
      }
    });
    await expect(
      preflight(
        '[video]\nfile="video.bad"',
        new Map([['video.bad', file('p/video.bad')]]),
        { ...a.context(), video: 'absent', count: 0 },
        a
      )
    ).rejects.toThrow('unsupported video');
    expect(a.uploadVideo).not.toHaveBeenCalled();
    expect(a.applyField).not.toHaveBeenCalled();
  });
  it('requires the page scheduling switch when only at is supplied', async () => {
    const a = mockAdapter({ readField: () => false });
    await expect(
      preflight('[publish]\nat=2026-10-05T18:00:00Z', new Map(), a.context(), a)
    ).rejects.toThrow('必须已启用');
  });
  it('rejects missing/invalid subtitles before writes', async () => {
    const a = mockAdapter(),
      raw = '[[subtitles]]\nfile="zh.srt"\nlanguage="中文"';
    await expect(preflight(raw, new Map(), a.context(), a)).rejects.toThrow('不存在');
    await expect(
      preflight(raw, new Map([['zh.srt', file('p/zh.srt', 'bad')]]), a.context(), a)
    ).rejects.toThrow();
    expect(a.applySubtitle).not.toHaveBeenCalled();
  });
  it('opens the native picker synchronously and cleans up cancellation', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement
    ) {
      expect(this.webkitdirectory).toBe(true);
      this.dispatchEvent(new Event('cancel'));
    });
    const selection = pickDirectory(new AbortController().signal);
    expect(click).toHaveBeenCalledOnce();
    expect(await selection).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
    click.mockRestore();
  });
});
describe('crop positions', () => {
  it('maps crop travel to native minimum-fit drag without moving an uncropped axis', () => {
    const wide = coverPan(1600, 1000, 420, 236.25, [25, 75]);
    expect(wide.x).toBe(0);
    expect(wide.y).toBeCloseTo(-6.5625);
    const standard = coverPan(1600, 1000, 315, 236.25, [65, 25]);
    expect(standard.x).toBeCloseTo(-9.45);
    expect(standard.y).toBe(0);
    expect(coverPan(1280, 720, 315, 236.25, [50, 50])).toEqual({ x: 0, y: 0 });
    expect(coverPan(1280, 720, 315, 236.25, [100, 100]).x).toBeCloseTo(-52.5);
    expect(coverPan(900, 1600, 420, 236.25, [25, 75]).y).toBeCloseTo(-127.6041667);
    expect(coverPan(900, 1600, 315, 236.25, [65, 25]).y).toBeCloseTo(80.9375);
    expect(() => coverPan(900, 1600, 0, 0, [50, 50])).toThrow('无效');
  });
  it('maps position to the movable range of each ratio', () => {
    expect(cropRect(1600, 900, 4 / 3, [0, 0])).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
    expect(cropRect(1600, 900, 4 / 3, [50, 50]).x).toBe(200);
    expect(cropRect(1600, 900, 4 / 3, [100, 100]).x).toBe(400);
    expect(cropRect(900, 1600, 16 / 9, [50, 100]).y).toBe(1093.75);
  });
});
