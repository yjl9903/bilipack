import { createController } from './application/controller';
import { createBilibiliAdapter } from './bilibili/adapter';
import { observePage } from './bilibili/lifecycle';
import { mount } from './panel/mount';
import { mountDirectoryEntry } from './entry/mount';

// Reinitialize only Bilipack during development; a full-page HMR reload discards uploads.
import.meta.hot?.accept();

if (window.top === window.self && !document.getElementById('bilipack-root')) {
  const { entry, ...adapter } = createBilibiliAdapter();
  const controller = createController(adapter);
  const unmount = mount(controller);
  const unmountEntry = mountDirectoryEntry(
    controller,
    () => entry.directoryEntryTarget(),
    (files) => entry.nativeVideoEntry(files),
    () => entry.directoryEntryPresentation()
  );
  const unobserve = observePage(adapter, controller.updatePage);
  const dispose = () => {
    unobserve();
    unmountEntry();
    controller.dispose();
    unmount();
    window.removeEventListener('pagehide', dispose);
  };
  window.addEventListener('pagehide', dispose, { once: true });
  import.meta.hot?.dispose(dispose);
}
