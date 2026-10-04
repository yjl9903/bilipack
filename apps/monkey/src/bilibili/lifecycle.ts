import type { PageAdapter, PageContext } from '../workflow/port';
/** Read at low frequency, including SPA URL changes; no history monkey-patching. */
export function observePage(adapter: PageAdapter, change: (context: PageContext) => void) {
  let previous = '';
  const tick = () => {
    const context = adapter.context(),
      key = JSON.stringify(context);
    if (key !== previous) {
      previous = key;
      change(context);
    }
  };
  const timer = setInterval(tick, 1000);
  window.addEventListener('popstate', tick);
  window.addEventListener('hashchange', tick);
  tick();
  return () => {
    clearInterval(timer);
    window.removeEventListener('popstate', tick);
    window.removeEventListener('hashchange', tick);
  };
}
