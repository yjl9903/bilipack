import { createApp } from 'vue';

import App from './App.vue';

import style from './style.css?style';

import type { Controller } from '../application/controller';

export function mount(controller: Controller) {
  const host = document.createElement('div');
  host.id = 'bilipack-root';
  host.style.cssText = 'position:relative;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(style);
  const root = document.createElement('div');
  shadow.append(root);
  document.body.append(host);
  const app = createApp(App, { controller });
  app.mount(root);

  return () => {
    app.unmount();
    host.remove();
  };
}
