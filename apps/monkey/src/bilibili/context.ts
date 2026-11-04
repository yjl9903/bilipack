import { selectors } from './selectors';
import { isSubmissionWaiting } from './submission';
import { readVideoRows, sameVideoRows, type VideoRow } from './videos';
import type { PageContext } from '../workflow/port';

export function createContextReader(doc: Document = document, url = () => location.href) {
  let generation = 0,
    previous = '',
    previousRoot: Element | null = null;
  let previousRows: VideoRow[] = [];
  let expectedUpload:
    | { root: Element; identity: string; names: string[][]; deadline: number; nodes: Element[] }
    | undefined;
  let expectedRename: { node: Element; before: string; after: string } | undefined;

  const read = (): PageContext => {
    const address = new URL(url());
    const forms = doc.querySelectorAll(selectors.form);
    const root = forms.length === 1 ? forms[0] : null;
    const editing =
      address.searchParams.get('type') === 'edit' &&
      /^BV[0-9A-Za-z]{10}$/.test(address.searchParams.get('bvid') ?? '');
    const rows = readVideoRows(root),
      count = rows.length;
    const titleInputs = root?.querySelectorAll<HTMLInputElement>(selectors.title);
    const hasTitle = titleInputs?.length === 1;
    const titleVisible =
      !!hasTitle &&
      titleInputs![0].getClientRects().length > 0 &&
      doc.defaultView?.getComputedStyle(titleInputs![0]).visibility !== 'hidden';
    const submissionWaiting = isSubmissionWaiting(
      (root as HTMLElement | null)?.innerText ?? '',
      editing,
      count,
      titleVisible
    );
    const identity = address.pathname + address.search + address.hash;
    const samePage = identity === previous && root === previousRoot;
    if (expectedUpload && (!samePage || Date.now() > expectedUpload.deadline))
      expectedUpload = undefined;
    const acceptedUpload =
      !!expectedUpload &&
      count > 0 &&
      count <= expectedUpload.names.length &&
      count >= expectedUpload.nodes.length &&
      root === expectedUpload.root &&
      identity === expectedUpload.identity &&
      rows.every(
        (row, index) =>
          (!expectedUpload!.nodes[index] || expectedUpload!.nodes[index] === row.node) &&
          (!row.title || expectedUpload!.names[index].includes(row.title))
      );
    if (acceptedUpload) expectedUpload!.nodes = rows.map((row) => row.node);
    const acceptedRename =
      !!expectedRename &&
      rows.length === previousRows.length &&
      rows.every(
        (row, index) =>
          row.node === previousRows[index].node &&
          !(previousRows[index].state === 'ready' && row.state !== 'ready') &&
          (row.node === expectedRename!.node
            ? [expectedRename!.before, expectedRename!.after].includes(row.title)
            : row.title === previousRows[index].title)
      );
    if (!samePage || (!acceptedUpload && !acceptedRename && !sameVideoRows(previousRows, rows))) {
      generation++;
      expectedUpload = undefined;
      expectedRename = undefined;
    }
    previous = identity;
    previousRoot = root;
    previousRows = rows;
    const blank =
      count === 0 &&
      !hasTitle &&
      root?.querySelectorAll(selectors.entrance).length === 1 &&
      root?.querySelectorAll(selectors.entranceInput).length === 1;
    const target =
      address.hostname === 'member.bilibili.com' &&
      address.pathname === '/platform/upload/video/frame' &&
      (editing
        ? count > 0 && rows.every((row) => !!row.title)
        : !address.searchParams.has('bvid') && address.searchParams.get('type') !== 'edit') &&
      !!root &&
      (editing || root.querySelectorAll(selectors.task).length <= 1) &&
      (hasTitle || blank || !!expectedUpload || submissionWaiting);
    const video =
      count > 0
        ? rows.some((row) => row.state === 'failed')
          ? 'failed'
          : rows.some((row) => row.state === 'unknown')
            ? 'unknown'
            : rows.every((row) => row.state === 'ready')
              ? 'ready'
              : 'uploading'
        : blank
          ? 'absent'
          : 'unknown';
    return {
      identity,
      generation,
      target,
      count,
      video,
      editor: !!hasTitle && !submissionWaiting,
      submissionWaiting
    };
  };
  return Object.assign(read, {
    expectUpload(files: readonly File[]) {
      const page = read();
      if (!page.target || page.video !== 'absent' || !previousRoot || !files.length)
        throw new Error('页面已有视频或状态不明，不执行上传');
      expectedUpload = {
        root: previousRoot,
        identity: page.identity,
        names: files.map((file) => [file.name, file.name.replace(/\.[^.]+$/, '')]),
        deadline: Date.now() + 40_000,
        nodes: []
      };
    },
    cancelExpectedUpload() {
      expectedUpload = undefined;
    },
    expectRename(part: number, title: string) {
      read();
      const row = previousRows[part - 1];
      if (!row) throw new Error('分 P 不存在');
      expectedRename = { node: row.node, before: row.title, after: title };
    },
    cancelExpectedRename() {
      expectedRename = undefined;
    }
  });
}
