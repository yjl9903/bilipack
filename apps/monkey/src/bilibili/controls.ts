export function unique<T extends Element>(root: ParentNode, selector: string): T {
  const nodes = root.querySelectorAll<T>(selector);
  if (nodes.length !== 1) throw new Error(`控件匹配数量为 ${nodes.length}，无法唯一定位`);
  return nodes[0];
}
export function writeText(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  check: () => void
) {
  if (!input.isConnected || input.disabled || input.readOnly) throw new Error('控件不可编辑');
  const prototype =
    input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  check();
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
  check();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  check();
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
/** This primitive does not prove the site accepted or completed an upload. */
export function assignFile(input: HTMLInputElement, file: File, check: () => void) {
  if (!input.isConnected || input.type !== 'file' || input.disabled)
    throw new Error('文件控件不可用');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  check();
  input.files = transfer.files;
  check();
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
export function waitFor<T>(
  read: () => T | undefined,
  signal: AbortSignal,
  timeout = 5000,
  interval = 100
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error('页面上下文已失效，停止后续操作'));
    };
    const tick = () => {
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        const value = read();
        if (value !== undefined) {
          cleanup();
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeout) {
          cleanup();
          reject(new Error('等待页面结果超时；请检查已保留的现场'));
          return;
        }
        timer = setTimeout(tick, interval);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    tick();
  });
}

export const visible = (el: Element) =>
  el.getClientRects().length > 0 &&
  el.ownerDocument.defaultView!.getComputedStyle(el).visibility !== 'hidden';
export function one<T extends Element = HTMLElement>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`${label}：找到 ${items.length} 个控件`);
  return items[0];
}
export function click(el: Element) {
  if (
    !visible(el) ||
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.classList.contains('disabled')
  )
    throw new Error('控件不可操作');
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView })
  );
}
