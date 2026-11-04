import type { VideoState } from '../workflow/port';
import { unique, visible } from './controls';
import { selectors } from './selectors';

export interface VideoRow {
  node: Element;
  title: string;
  state: VideoState;
}

/** Only native DOM is read; no platform component instances or private stores. */
export function readVideoRows(root: Element | null): VideoRow[] {
  return Array.from(root?.querySelectorAll('.file-item') ?? []).map((node) => {
    const input = node.querySelector<HTMLInputElement>(
      'input:not([type=file]):not([type=checkbox])'
    );
    const title =
      input && visible(input)
        ? input.value
        : (node.querySelector('.title-text')?.textContent ?? '');
    const status = node.querySelector('.file-item-content-status')?.textContent?.trim() ?? '';
    const state = videoState(status);
    return { node, title, state };
  });
}

/** Names alone cannot establish identity: ordered native rows must also be retained. */
export function sameVideoRows(previous: readonly VideoRow[], next: readonly VideoRow[]): boolean {
  return (
    previous.length === next.length &&
    previous.every(
      (row, index) =>
        row.node === next[index].node &&
        row.title === next[index].title &&
        !(row.state === 'ready' && next[index].state !== 'ready')
    )
  );
}

export function createVideoReader(doc: Document) {
  return () => readVideoRows(unique(doc, selectors.form));
}

export function videoState(status: string): VideoState {
  if (status.trim() === '上传完成') return 'ready';
  if (/失败|错误/.test(status)) return 'failed';
  if (/上传中|等待上传|排队|已经上传[：:]/.test(status)) return 'uploading';
  return 'unknown';
}
