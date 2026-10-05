import { ValidationError } from 'bilipack';
import { matchesContext, type PageAdapter, type PageContext } from '../workflow/port';
import { pickDirectory } from '../input/picker';
import { indexFiles, requireFile } from '../input/files';
import { releaseCovers } from '../input/cover';
import { prepare } from '../input/prepare';
import { checkPageConditions } from './conditions';
import { plan } from '../workflow/plan';
import { run } from '../workflow/run';
import { compare } from '../workflow/compare';
import { summarize, executionStatus, presentAttachments } from './presentation';
import type { Prepared } from '../input/types';
import type { Result } from '../workflow/types';
import type { ViewState } from './types';
export function createController(adapter: PageAdapter) {
  let state: ViewState = {
    directoryName: null,
    visible: false,
    busy: false,
    raw: null,
    attachments: [],
    results: [],
    summary: ''
  };
  let prepared: Prepared | undefined,
    active: AbortController | undefined,
    bound: PageContext | undefined,
    reviewPage: PageContext | undefined,
    disposed = false;
  const listeners = new Set<(state: ViewState) => void>();
  let retryResults: readonly Result[] | undefined;
  let pendingPanelUpload: PageContext | undefined;
  const publish = (patch: Partial<ViewState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((f) => f(state));
  };
  const samePage = (a: PageContext, b: PageContext) => matchesContext(a, b) && b.count === 1;
  const execute = async (
    input: Prepared,
    page: PageContext,
    signal: AbortSignal,
    previous?: readonly Result[]
  ) => {
    publish({ panelStatus: 'executing' });
    adapter.assertContext(page);
    if (page.video === 'absent') pendingPanelUpload = { ...page };
    const results = await run(
      plan(input, page),
      {
        prepared: input,
        page,
        adapter,
        signal
      },
      (results, currentStep) => {
        const observing = currentStep?.phase === 'observe';
        publish({
          results,
          currentStep,
          ...(observing
            ? {
                panelStatus: 'video-wait' as const,
                canWrite: false,
                summary: '表单操作已结束，可继续编辑；正在等待视频上传完成。'
              }
            : {})
        });
      },
      previous
    );
    const currentPage = adapter.context();
    const interrupted = signal.aborted || !matchesContext(page, currentPage);
    const retryWrite =
      !interrupted &&
      !currentPage.submissionWaiting &&
      samePage(page, currentPage) &&
      results.some((result) => ['failed', 'unverified', 'blocked'].includes(result.status));
    reviewPage = retryWrite ? { ...currentPage } : undefined;
    retryResults = retryWrite ? results : undefined;
    publish({
      results,
      canWrite: retryWrite,
      summary: summarize(results),
      panelStatus: interrupted ? 'interrupted' : executionStatus(results)
    });
  };
  const reportError = (error: unknown, signal: AbortSignal) => {
    const results =
      error instanceof ValidationError
        ? error.diagnostics.map((d) => ({
            id: d.field,
            role: 'condition' as const,
            status: 'blocked' as const,
            message: d.message
          }))
        : [
            {
              id: 'import',
              role: 'condition' as const,
              status: 'failed' as const,
              message: signal.aborted
                ? '页面已变化或实例已卸载，停止后续操作；保留现场'
                : (error as Error).message
            }
          ];
    publish({
      results,
      canWrite: false,
      summary: summarize(results),
      panelStatus:
        signal.aborted ||
        state.panelStatus === 'interrupted' ||
        (bound && !matchesContext(bound, adapter.context()))
          ? 'interrupted'
          : 'error'
    });
  };
  return {
    subscribe(listener: (state: ViewState) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    updatePage(page: PageContext) {
      const panelVisible = page.target && (page.submissionWaiting || page.editor);
      const enteringEditor = panelVisible && !state.panelVisible;
      const ownUpload =
        !!pendingPanelUpload &&
        page.target &&
        page.identity === pendingPanelUpload.identity &&
        page.generation === pendingPanelUpload.generation;
      if (pendingPanelUpload && (!ownUpload || enteringEditor)) pendingPanelUpload = undefined;
      publish({
        visible: page.target,
        panelVisible,
        panelInitiallyExpanded: !panelVisible
          ? false
          : enteringEditor
            ? ownUpload
            : state.panelInitiallyExpanded
      });
      if (page.target && page.submissionWaiting) {
        reviewPage = undefined;
        retryResults = undefined;
        publish({
          canWrite: false,
          panelStatus: state.busy || !state.panelStatus ? 'video-wait' : state.panelStatus,
          summary: state.busy ? '正在等待视频上传完成。' : state.summary
        });
      }
      if (reviewPage && !samePage(reviewPage, page)) {
        reviewPage = undefined;
        retryResults = undefined;
        publish({
          canWrite: false,
          panelStatus: 'interrupted',
          summary: '页面或稿件已变化，请重新选择目录。'
        });
      }
      if (bound && active && !matchesContext(bound, page)) {
        if (state.directoryName !== null) publish({ panelStatus: 'interrupted' });
        active.abort(new Error('页面或稿件已变化，停止后续操作；保留此前已核验结果'));
      }
    },
    clearSelection() {
      // Clearing the local selection is not a stop action and never resets the native form.
      if (state.busy || disposed) return;
      if (prepared) releaseCovers(prepared.covers);
      prepared = undefined;
      reviewPage = undefined;
      retryResults = undefined;
      pendingPanelUpload = undefined;
      publish({
        canWrite: false,
        comparison: false,
        directoryName: null,
        panelStatus: undefined,
        raw: null,
        attachments: [],
        results: [],
        summary: ''
      });
    },
    async importDirectory(source?: (signal: AbortSignal) => Promise<File[] | null>) {
      if (state.busy || disposed || adapter.context().submissionWaiting) return;
      active = new AbortController();
      const signal = active.signal;
      bound = adapter.context();
      publish({
        busy: true,
        currentStep: { phase: source ? 'drop' : 'pick' }
      });
      try {
        const selection = (source ?? pickDirectory)(signal); // Keep native picker in the click gesture.
        const files = await selection;
        if (!files || signal.aborted) return;
        if (prepared) releaseCovers(prepared.covers);
        prepared = undefined;
        reviewPage = undefined;
        retryResults = undefined;
        publish({
          canWrite: false,
          comparison: bound.video !== 'absent',
          directoryName: files[0]?.webkitRelativePath.split('/')[0] || null,
          panelStatus: 'preparing',
          raw: null,
          attachments: [],
          results: [],
          summary: '',
          currentStep: { phase: 'read-config' }
        });
        const index = indexFiles(files);
        const raw = await requireFile(index, 'bilipack.toml', 'bilipack.toml').text();
        publish({ raw });
        signal.throwIfAborted();
        adapter.assertContext(bound);
        publish({ currentStep: { phase: 'prepare' } });
        prepared = await prepare(raw, index, { requireVideo: bound.video === 'absent' });
        if (signal.aborted) {
          releaseCovers(prepared.covers);
          prepared = undefined;
          throw signal.reason;
        }
        try {
          checkPageConditions(prepared, bound, adapter);
        } catch (error) {
          releaseCovers(prepared.covers);
          prepared = undefined;
          throw error;
        }
        const attachments = presentAttachments(prepared);
        signal.throwIfAborted();
        adapter.assertContext(bound);
        publish({ attachments });
        if (bound.video !== 'absent') {
          publish({ panelStatus: 'comparing' });
          const results = await compare(
            { prepared, page: bound, adapter, signal },
            (results, currentStep) => publish({ results, currentStep })
          );
          signal.throwIfAborted();
          adapter.assertContext(bound);
          if (!samePage(bound, adapter.context())) {
            publish({ panelStatus: 'interrupted' });
            throw new Error('页面或稿件已变化，请重新选择目录');
          }
          reviewPage = { ...bound };
          publish({
            results,
            canWrite: true,
            panelStatus: 'awaiting-write',
            summary: '比对完成，请确认结果后点击「写入配置」。'
          });
        } else {
          await execute(prepared, bound, signal);
        }
      } catch (e) {
        reportError(e, signal);
      } finally {
        active = undefined;
        bound = undefined;
        publish({ busy: false, currentStep: undefined });
      }
    },
    async writeConfiguration() {
      if (disposed || state.busy || !state.canWrite || !prepared || !reviewPage) return;
      active = new AbortController();
      const signal = active.signal;
      bound = { ...reviewPage };
      const previous = retryResults;
      publish({
        busy: true,
        canWrite: false,
        panelStatus: 'executing',
        currentStep: { phase: 'check-page' }
      });
      try {
        adapter.assertContext(bound);
        if (!samePage(bound, adapter.context())) {
          publish({ panelStatus: 'interrupted' });
          throw new Error('页面或稿件已变化，请重新选择目录后比对');
        }
        reviewPage = undefined;
        publish({ comparison: false });
        await execute(prepared, bound, signal, previous);
      } catch (error) {
        reportError(error, signal);
      } finally {
        active = undefined;
        bound = undefined;
        publish({ busy: false, currentStep: undefined });
      }
    },
    dispose() {
      disposed = true;
      active?.abort();
      if (prepared) releaseCovers(prepared.covers);
      listeners.clear();
    }
  };
}
export type Controller = ReturnType<typeof createController>;
