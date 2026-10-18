import { createApp } from 'vue';
import { onCleanup } from './cleanup';

/** Real Vue components; unmount even if an assertion fails before explicit teardown. */
export const createTestApp: typeof createApp = (...args) => {
  const app = createApp(...args);
  const mount = app.mount;
  const unmount = app.unmount;
  let mounted = false;
  app.mount = (...args) => {
    const instance = mount(...args);
    mounted = true;
    return instance;
  };
  app.unmount = onCleanup(() => {
    if (mounted) unmount();
  });
  return app;
};
