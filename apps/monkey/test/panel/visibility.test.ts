import { onCleanup } from '../support/cleanup';
import { createTestApp } from '../support/vue';
import { expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import App from '../../src/panel/App.vue';
import { mountDirectoryEntry } from '../../src/entry/mount';
import { createTestController } from '../support/controller';
import type { PageContext } from '../../src/workflow/port';
import type { ViewState } from '../../src/application/types';
import { file } from '../support/fixtures';
import { fakeAdapter } from '../support/page-adapter';
vi.mock('../../src/entry/style.css?style', () => ({ default: document.createElement('style') }));

function setup() {
  let page: PageContext = {
    identity: 'upload',
    generation: 1,
    target: true,
    count: 0,
    video: 'absent',
    editor: false
  };
  const adapter = fakeAdapter({ context: () => ({ ...page }) });
  const controller = createTestController(adapter);
  const host = document.createElement('div');
  const anchor = document.createElement('div');
  document.body.append(host, anchor);
  const app = createTestApp(App, { controller });
  app.mount(host);
  onCleanup(
    mountDirectoryEntry(
      controller,
      () => (page.video === 'absent' ? anchor : null),
      vi.fn(),
      () => null
    )
  );

  const changePage = (patch: Partial<PageContext>) => {
    page = { ...page, ...patch };
  };
  const update = (patch: Partial<PageContext>) => {
    changePage(patch);
    controller.updatePage(page);
  };
  update({});
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      value: [
        file('p/bilipack.toml', '[video]\nfile="video.mp4"\n[info]\ntitle="目标"'),
        file('p/video.mp4')
      ]
    });
    this.dispatchEvent(new Event('change'));
  });
  return { host, adapter, controller, update, changePage };
}

it('hides the launcher on the upload page, expands the controlled editor once, and shows activity when collapsed', async () => {
  const { host, adapter, controller, update } = setup();
  expect(host.querySelector('.floating-panel')).toBeNull();
  const entry = document.querySelector<HTMLButtonElement>('#bilipack-directory-entry')!;
  expect(entry).not.toBeNull();
  let enterEditor!: () => void;
  let finishUpload!: () => void;
  adapter.waitEditor = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        enterEditor = resolve;
      })
  );
  adapter.waitVideo = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishUpload = resolve;
      })
  );
  adapter.uploadVideo = vi.fn(async () => {
    update({ count: 1, video: 'uploading', editor: false });
  });
  entry.click();
  await vi.waitFor(() => expect(adapter.waitEditor).toHaveBeenCalledOnce());
  expect(host.querySelector('.floating-panel')).toBeNull();
  update({ editor: true });
  enterEditor();
  await vi.waitFor(() => expect(adapter.waitVideo).toHaveBeenCalledOnce());
  await nextTick();
  expect(host.querySelector('aside')?.style.display).not.toBe('none');
  expect(host.querySelector('.launcher')).toBeNull();
  host.querySelector<HTMLButtonElement>('.collapse-button')!.click();
  await nextTick();
  expect(host.querySelector('.launcher')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('.launcher-progress')).not.toBeNull();
  update({});
  // v-show hides the panel after its leave transition completes.
  await vi.waitFor(() => expect(host.querySelector('aside')?.style.display).toBe('none'));
  update({ video: 'ready' });
  finishUpload();
  await vi.waitFor(() => expect(host.querySelector('.launcher-progress')).toBeNull());
  expect(host.querySelector('.launcher')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('aside')?.style.display).toBe('none');
  controller.clearSelection();
  update({ count: 0, video: 'absent', editor: false, generation: 2 });
  await nextTick();
  expect(host.querySelector('.floating-panel')).toBeNull();
  expect(document.querySelector('#bilipack-directory-entry')).not.toBeNull();
  update({ count: 1, video: 'ready', editor: true, generation: 3 });
  await nextTick();
  expect(host.querySelector('.launcher')).not.toBeNull();
  expect(host.querySelector('aside')?.style.display).toBe('none');
});

it('remembers the controlled entry when the upload finishes before the next page observation', async () => {
  const { host, adapter, controller, update, changePage } = setup();
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  // Adapter reads see the completed upload before the observer notifies the controller.
  adapter.uploadVideo = vi.fn(async () => {
    changePage({ count: 1, video: 'ready', editor: true });
  });
  await controller.importDirectory();
  expect(adapter.waitVideo).toHaveBeenCalledOnce();
  expect(adapter.applyField).toHaveBeenCalledOnce();
  expect(state.panelStatus).toBe('completed');
  expect(state.busy).toBe(false);
  expect(state.results.map(({ id, status }) => [id, status])).toEqual([
    ['video.upload', 'verified'],
    ['editor.ready', 'verified'],
    ['info.title', 'verified'],
    ['video.ready', 'verified']
  ]);
  expect(host.querySelector('.floating-panel')).toBeNull();
  update({});
  await nextTick();
  await nextTick();
  expect(host.querySelector('aside')?.style.display).not.toBe('none');
  expect(host.querySelector('.launcher')).toBeNull();
});
