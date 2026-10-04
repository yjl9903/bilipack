import { afterEach, expect, it, vi } from 'vitest';
import { createBilibiliAdapter } from '../src/bilibili/adapter';
import type { PageContext } from '../src/workflow/port';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('uses the native picker and passes dropped videos to its change handler without Bilipack writes', () => {
  document.body.innerHTML =
    '<div id="video-up-app"><div class="video-entrance"><div class="bcc-upload-wrapper"><input type="file" accept=".mp4,.mov"></div></div></div>';
  const input = document.querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [], writable: true });
  vi.stubGlobal(
    'DataTransfer',
    class {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    }
  );
  const page: PageContext = {
    target: true,
    editor: false,
    video: 'absent',
    count: 0,
    identity: 'test',
    generation: 1
  };
  const readContext = Object.assign(() => page, {
    expectUpload: vi.fn(),
    cancelExpectedUpload: vi.fn()
  });
  const adapter = createBilibiliAdapter(document, readContext);
  const click = vi.spyOn(input, 'click').mockImplementation(() => {});
  const change = vi.fn();
  input.addEventListener('change', change);
  adapter.entry.nativeVideoEntry();
  expect(click).toHaveBeenCalledOnce();
  const video = new File(['video'], 'video.mp4');
  adapter.entry.nativeVideoEntry([video]);
  expect(Array.from(input.files!)).toEqual([video]);
  expect(change).toHaveBeenCalledOnce();
  expect(readContext.expectUpload).not.toHaveBeenCalled();
  expect(() => adapter.entry.nativeVideoEntry([new File(['text'], 'notes.txt')])).toThrow('扩展名');
  expect(change).toHaveBeenCalledOnce();
  page.video = 'uploading';
  expect(() => adapter.entry.nativeVideoEntry([video])).toThrow('不再是视频上传入口');
  expect(change).toHaveBeenCalledOnce();
});
