import { selectors } from './selectors';
import { isSubmissionWaiting, acceptsSubmissionCaption } from './submission';
import type { PageContext } from '../workflow/port';

export function createContextReader(doc: Document = document, url = () => location.href) {
  let generation = 0,
    previous = '',
    previousRoot: Element | null = null;
  let previousTask: Element | null = null,
    previousTitle = '',
    previousEditorTitle = '',
    previousVideoTitle = '';
  let expectedUpload:
    | { root: Element; identity: string; names: string[]; deadline: number; task?: Element }
    | undefined;

  const read = (): PageContext => {
    const address = new URL(url());
    const forms = doc.querySelectorAll(selectors.form);
    const root = forms.length === 1 ? forms[0] : null;
    const editing =
      address.searchParams.get('type') === 'edit' &&
      /^BV[0-9A-Za-z]{10}$/.test(address.searchParams.get('bvid') ?? '');
    const tasks = root?.querySelectorAll(editing ? '.file-item' : selectors.task);
    const count = tasks?.length ?? 0;
    const task = count === 1 ? tasks![0] : null;
    const taskTitle =
      task?.querySelector(editing ? '.title-text' : selectors.taskTitle)?.textContent?.trim() ?? '';
    const titleInputs = root?.querySelectorAll<HTMLInputElement>(selectors.title);
    const hasTitle = titleInputs?.length === 1;
    const titleVisible =
      !!hasTitle &&
      titleInputs![0].isConnected &&
      titleInputs![0].getClientRects().length > 0 &&
      doc.defaultView?.getComputedStyle(titleInputs![0]).visibility !== 'hidden';
    // textContent also includes the native wait screen while it is hidden.
    // Only rendered text plus a hidden/absent title can establish this phase.
    const submissionWaiting = isSubmissionWaiting(
      (root as HTMLElement | null)?.innerText ?? '',
      editing,
      count,
      titleVisible
    );
    const fileTitles = root?.querySelectorAll('.file-item .title-text');
    const videoTitle = fileTitles?.length === 1 ? (fileTitles[0].textContent?.trim() ?? '') : '';
    const identity = address.pathname + address.search + address.hash;
    const samePage = identity === previous && root === previousRoot;
    if (expectedUpload && (!samePage || Date.now() > expectedUpload.deadline))
      expectedUpload = undefined;
    // Only accept the first task produced by our own upload, on the same root and route,
    // with a name matching the selected file. Any other task/route change interrupts the run.
    const acceptedUpload =
      !!expectedUpload &&
      count === 1 &&
      expectedUpload.root === root &&
      expectedUpload.identity === identity &&
      (!expectedUpload.task || expectedUpload.task === task) &&
      (!taskTitle || expectedUpload.names.includes(taskTitle));
    if (acceptedUpload) expectedUpload!.task = task!;
    // Submission replaces the form with a wait screen and may rename the queue
    // caption to the entered title. A rebuilt task also needs the unchanged
    // native file title; a caption alone cannot identify a replacement task.
    const videoChanged = !!previousVideoTitle && !!videoTitle && videoTitle !== previousVideoTitle;
    const acceptedSubmission =
      !videoChanged &&
      acceptsSubmissionCaption(
        submissionWaiting,
        samePage,
        task === previousTask,
        taskTitle,
        previousTitle,
        hasTitle && !submissionWaiting ? titleInputs![0].value.trim() : previousEditorTitle,
        !!videoTitle && videoTitle === previousVideoTitle
      );
    if (
      !samePage ||
      videoChanged ||
      (!acceptedUpload &&
        !acceptedSubmission &&
        (task !== previousTask || taskTitle !== previousTitle))
    )
      generation++;
    if (task && !acceptedUpload) expectedUpload = undefined;
    previous = identity;
    previousRoot = root;
    previousTask = task;
    previousTitle = taskTitle;
    previousVideoTitle = videoTitle;

    if (hasTitle) previousEditorTitle = titleInputs![0].value.trim();
    else if (!acceptedSubmission) previousEditorTitle = '';
    const blank =
      count === 0 &&
      !hasTitle &&
      root?.querySelectorAll(selectors.entrance).length === 1 &&
      root?.querySelectorAll(selectors.entranceInput).length === 1;
    const target =
      address.hostname === 'member.bilibili.com' &&
      address.pathname === '/platform/upload/video/frame' &&
      (editing
        ? count === 1 && !!taskTitle
        : !address.searchParams.has('bvid') && address.searchParams.get('type') !== 'edit') &&
      !!root &&
      (hasTitle || blank || !!expectedUpload || submissionWaiting);
    const status = task
      ?.querySelector(editing ? '.file-item-content-status .success' : selectors.taskStatus)
      ?.textContent?.trim();
    const video =
      count === 1
        ? status === '上传完成'
          ? 'ready'
          : status === '上传中...'
            ? 'uploading'
            : 'unknown'
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
    expectUpload(file: File) {
      const page = read();
      if (!page.target || page.video !== 'absent' || !previousRoot)
        throw new Error('页面已有视频或状态不明，不执行上传');
      expectedUpload = {
        root: previousRoot,
        identity: page.identity,
        names: [file.name, file.name.replace(/\.[^.]+$/, '')],
        deadline: Date.now() + 20_000
      };
    },
    cancelExpectedUpload() {
      expectedUpload = undefined;
    }
  });
}
