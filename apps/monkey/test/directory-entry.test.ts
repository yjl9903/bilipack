import { afterEach, expect, it, vi } from 'vitest';
import { mountDirectoryEntry } from '../src/entry/mount';
import { createController } from '../src/application/controller';
import { mockAdapter } from './helpers';
import type { ViewState } from '../src/application/types';

// Match vite-plugin-monkey's ?style export in this local DOM test.
vi.mock('../src/entry/style.css?style', () => ({ default: document.createElement('style') }));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('reuses the native SVG symbol and restores the original presentation when removed', () => {
  const anchor = document.createElement('div');
  anchor.innerHTML =
    '<div class="native-content"><svg class="native-icon"><use href="#native-upload-cloud"></use></svg><button>上传视频</button></div>';
  document.body.append(anchor);
  const content = anchor.querySelector<HTMLElement>('.native-content')!;
  const icon = anchor.querySelector<SVGElement>('svg')!;
  const controller = createController(mockAdapter());
  const dispose = mountDirectoryEntry(
    controller,
    () => anchor,
    vi.fn(),
    () => ({ content, icon })
  );
  controller.updatePage(mockAdapter().context());
  try {
    const copy = anchor.querySelector<SVGElement>('#bilipack-upload-section svg')!;
    expect(copy).not.toBe(icon);
    expect(copy.querySelector('use')?.getAttribute('href')).toBe('#native-upload-cloud');
    expect(copy.querySelector('path')).toBeNull();
    expect(content.style.visibility).toBe('hidden');
    expect(icon.isConnected).toBe(true);
    controller.updatePage({ ...mockAdapter().context(), target: false });
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
  const adapter = mockAdapter();
  const controller = createController(adapter);
  const dispose = mountDirectoryEntry(
    controller,
    () => anchor,
    vi.fn(),
    () => null
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
  const controller = createController(mockAdapter());
  const importDirectory = vi.spyOn(controller, 'importDirectory');
  const nativeVideoEntry = vi.fn();
  const nativeDrop = vi.fn();
  anchor.addEventListener('drop', nativeDrop);
  const dispose = mountDirectoryEntry(
    controller,
    () => anchor,
    nativeVideoEntry,
    () => null
  );
  controller.updatePage(mockAdapter().context());
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
  } finally {
    dispose();
    controller.dispose();
  }
});

it('imports a dropped directory through the same workflow without opening a picker', async () => {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  const controller = createController(mockAdapter());
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  const nativeVideoEntry = vi.fn();
  const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
  const dispose = mountDirectoryEntry(
    controller,
    () => anchor,
    nativeVideoEntry,
    () => null
  );
  controller.updatePage(mockAdapter().context());
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
