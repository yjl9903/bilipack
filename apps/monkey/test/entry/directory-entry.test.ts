import { onCleanup } from '../support/cleanup';
import { expect, it, vi } from 'vitest';
import { mountDirectoryEntry } from '../../src/entry/mount';
import { createTestController } from '../support/controller';
import { fakeAdapter } from '../support/page-adapter';
import type { ViewState } from '../../src/application/types';
import type { UploadEntry } from '../../src/entry/port';
// Match vite-plugin-monkey's ?style export in this local DOM test.
vi.mock('../../src/entry/style.css?style', () => ({ default: document.createElement('style') }));

it('reuses the native SVG symbol and restores the original presentation when removed', () => {
  const anchor = document.createElement('div');
  anchor.innerHTML =
    '<div class="native-content"><svg class="native-icon"><use href="#native-upload-cloud"></use></svg><button>上传视频</button></div>';
  document.body.append(anchor);
  const content = anchor.querySelector<HTMLElement>('.native-content')!;
  const icon = anchor.querySelector<SVGElement>('svg')!;
  const controller = createTestController(fakeAdapter());
  const dispose = onCleanup(
    mountDirectoryEntry(
      controller,
      () => anchor,
      vi.fn(),
      () => ({ content, icon })
    )
  );
  controller.updatePage(fakeAdapter().context());
  try {
    const copy = anchor.querySelector<SVGElement>('#bilipack-upload-section svg')!;
    expect(copy).not.toBe(icon);
    expect(copy.querySelector('use')?.getAttribute('href')).toBe('#native-upload-cloud');
    expect(copy.querySelector('path')).toBeNull();
    expect(content.style.visibility).toBe('hidden');
    expect(icon.isConnected).toBe(true);
    controller.updatePage({ ...fakeAdapter().context(), target: false });
    expect(content.style.visibility).toBe('');
    expect(copy.isConnected).toBe(false);
  } finally {
    dispose();
    controller.dispose();
  }
});

it('covers the native upload area, opens a directory picker synchronously and prevents duplicate imports', async () => {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  const adapter = fakeAdapter();
  const controller = createTestController(adapter);
  const dispose = onCleanup(
    mountDirectoryEntry(
      controller,
      () => anchor,
      vi.fn(),
      () => null
    )
  );
  controller.updatePage(adapter.context());
  const section = anchor.querySelector<HTMLElement>('#bilipack-upload-section')!;
  expect(section.querySelector('h2')).toBeNull();
  expect(anchor.nextElementSibling).toBeNull();
  expect(anchor.style.position).toBe('relative');
  const button = section.querySelector<HTMLButtonElement>('#bilipack-directory-entry')!;
  expect(button.textContent).toBe('上传 Bilipack 目录');
  let picker!: HTMLInputElement;
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    picker = this;
  });
  button.click();
  expect(click).toHaveBeenCalledOnce();
  expect(picker.webkitdirectory).toBe(true);
  expect(button.disabled).toBe(true);
  button.click();
  expect(click).toHaveBeenCalledOnce();
  picker.dispatchEvent(new Event('cancel'));
  await Promise.resolve();
  expect(button.disabled).toBe(false);
  expect(document.querySelector('input[type=file]')).toBeNull();
  controller.updatePage({ ...adapter.context(), target: false });
  expect(section.isConnected).toBe(false);
  expect(button.isConnected).toBe(false);
  controller.updatePage(adapter.context());
  expect(section.parentElement).toBe(anchor);
  dispose();
  controller.dispose();
  expect(section.isConnected).toBe(false);
  expect(button.isConnected).toBe(false);
  expect(anchor.style.position).toBe('');
});

it('forwards video clicks and drops without starting Bilipack or leaking to native drop handlers', () => {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  const controller = createTestController(fakeAdapter());
  const importDirectory = vi.spyOn(controller, 'importDirectory');
  const nativeVideoEntry = vi.fn<UploadEntry['nativeVideoEntry']>();
  const nativeDrop = vi.fn();
  anchor.addEventListener('drop', nativeDrop);
  const dispose = onCleanup(
    mountDirectoryEntry(
      controller,
      () => anchor,
      nativeVideoEntry,
      () => null
    )
  );
  controller.updatePage(fakeAdapter().context());
  try {
    anchor.querySelector<HTMLButtonElement>('#bilipack-video-entry')!.click();
    expect(nativeVideoEntry).toHaveBeenCalledWith();
    const video = new File(['video'], 'sample.mp4');
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { items: [], files: [video] } });
    anchor.querySelector('#bilipack-upload-section')!.dispatchEvent(event);
    expect(nativeVideoEntry).toHaveBeenLastCalledWith([video]);
    expect(importDirectory).not.toHaveBeenCalled();
    expect(nativeDrop).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(nativeVideoEntry).toHaveBeenCalledTimes(2);
  } finally {
    dispose();
    controller.dispose();
  }
});

it.each(['click', 'drop'] as const)(
  'shows native entry failures from %s and clears them on a successful retry',
  (action) => {
    const anchor = document.createElement('div');
    document.body.append(anchor);
    const adapter = fakeAdapter();
    const controller = createTestController(adapter);
    const importDirectory = vi.spyOn(controller, 'importDirectory');
    const nativeVideoEntry = vi.fn<UploadEntry['nativeVideoEntry']>().mockImplementationOnce(() => {
      throw new Error('原生视频上传控件不可用');
    });
    const dispose = onCleanup(
      mountDirectoryEntry(
        controller,
        () => anchor,
        nativeVideoEntry,
        () => null
      )
    );
    controller.updatePage(adapter.context());
    const video = new File(['video'], 'sample.mp4');
    const invoke = () => {
      if (action === 'click') {
        anchor.querySelector<HTMLButtonElement>('#bilipack-video-entry')!.click();
      } else {
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { items: [], files: [video] } });
        anchor.querySelector('#bilipack-upload-section')!.dispatchEvent(event);
      }
    };
    try {
      invoke();
      const alert = anchor.querySelector<HTMLElement>('[role=alert]')!;
      expect(alert.hidden).toBe(false);
      expect(alert.textContent).toBe('原生视频上传控件不可用');
      invoke();
      expect(alert.hidden).toBe(true);
      expect(alert.textContent).toBe('');
      expect(nativeVideoEntry.mock.calls).toEqual(
        action === 'click' ? [[], []] : [[[video]], [[video]]]
      );
      expect(importDirectory).not.toHaveBeenCalled();
      expect(adapter.uploadVideo).not.toHaveBeenCalled();
      expect(adapter.applyField).not.toHaveBeenCalled();
    } finally {
      dispose();
      controller.dispose();
    }
  }
);

it('imports a dropped directory through the same workflow without opening a picker', async () => {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  const controller = createTestController(fakeAdapter());
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  const nativeVideoEntry = vi.fn();
  const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
  const dispose = onCleanup(
    mountDirectoryEntry(
      controller,
      () => anchor,
      nativeVideoEntry,
      () => null
    )
  );
  controller.updatePage(fakeAdapter().context());
  const config = new File(['[info]\ntitle = "拖放标题"'], 'bilipack.toml');
  Object.defineProperty(config, 'text', { value: async () => '[info]\ntitle = "拖放标题"' });
  const entry = {
    name: 'bilipack.toml',
    isFile: true,
    file: (resolve: (file: File) => void) => resolve(config)
  };
  const batches = [[entry], []];
  const root = {
    name: 'example',
    isDirectory: true,
    createReader: () => ({
      readEntries: (resolve: (entries: unknown[]) => void) => resolve(batches.shift()!)
    })
  };
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { items: [{ kind: 'file', webkitGetAsEntry: () => root }], files: [] }
  });
  try {
    anchor.querySelector('#bilipack-upload-section')!.dispatchEvent(event);
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(state.directoryName).toBe('example');
    expect(state.raw).toContain('拖放标题');
    expect(picker).not.toHaveBeenCalled();
    expect(nativeVideoEntry).not.toHaveBeenCalled();
  } finally {
    dispose();
    controller.dispose();
  }
});
