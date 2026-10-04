/** Call synchronously from the click handler; no awaits before input.click(). */
export function pickDirectory(signal: AbortSignal): Promise<File[] | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.hidden = true;
    const finish = (files: File[] | null) => {
      cleanup();
      resolve(files);
    };
    const abort = () => finish(null);
    const cleanup = () => {
      input.remove();
      signal.removeEventListener('abort', abort);
    };
    input.addEventListener(
      'change',
      () => finish(input.files?.length ? Array.from(input.files) : null),
      { once: true }
    );
    input.addEventListener('cancel', () => finish(null), { once: true });
    signal.addEventListener('abort', abort, { once: true });
    document.body.append(input);
    try {
      input.click();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}
