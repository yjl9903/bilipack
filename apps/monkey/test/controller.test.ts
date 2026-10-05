import { progressLabel } from '../src/panel/labels';
import { afterEach, it, expect, vi } from 'vitest';
import { createController } from '../src/application/controller';
import { file, mockAdapter } from './helpers';
import type { ViewState } from '../src/application/types';
function selectFiles(files: File[]) {
  return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', { value: files });
    this.dispatchEvent(new Event('change'));
  });
}
afterEach(() => vi.restoreAllMocks());
it.each([false, true])(
  'hands the form back while observing video (native submission wait: %s)',
  async (submissionWaiting) => {
    const video = file('p/video.mp4');
    selectFiles([
      file('p/bilipack.toml', '[video]\nfile="video.mp4"\n[info]\ntitle="目标"'),
      video
    ]);
    const adapter = mockAdapter();
    const verifyField = vi.spyOn(adapter, 'verifyField');
    let page = {
      ...adapter.context(),
      video: 'absent' as 'absent' | 'uploading' | 'ready',
      count: 0
    };
    adapter.context = () => ({ ...page });
    const uploadPage = adapter.context();
    const controller = createController(adapter);
    adapter.uploadVideo = vi.fn(async () => {
      page = { ...page, video: 'uploading', count: 1 };
      controller.updatePage(page);
      expect(adapter.applyField).not.toHaveBeenCalled();
    });
    adapter.waitEditor = vi.fn(async () => {
      expect(page.video).toBe('uploading');
      expect(adapter.applyField).not.toHaveBeenCalled();
    });
    let finishUpload!: () => void;
    const uploaded = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    adapter.waitVideo = vi.fn(async () => {
      expect(adapter.applyField).toHaveBeenCalledOnce();
      await uploaded;
      page = { ...page, video: 'ready' };
      controller.updatePage(page);
    });
    let state!: ViewState;
    controller.subscribe((s) => {
      state = s;
    });
    const job = controller.importDirectory();
    await vi.waitFor(() => expect(adapter.waitVideo).toHaveBeenCalledOnce());
    expect(state.busy).toBe(true);
    expect(progressLabel(state.currentStep!)).toContain('确认视频上传完成');
    expect(state.panelStatus).toBe('video-wait');
    expect(state.canWrite).toBe(false);
    expect(state.summary).toContain('可继续编辑');
    page = { ...page, submissionWaiting };
    controller.updatePage(page);
    expect(state.panelStatus).toBe('video-wait');
    verifyField.mockResolvedValue({ matches: false, actual: '用户修改', message: '用户已接手' });
    expect(state.results.find((r) => r.id === 'info.title')?.status).toBe('verified');
    expect(state.results.find((r) => r.id === 'video.ready')?.status).toBe('running');
    expect(state.results.find((r) => r.id === 'video.upload')).toMatchObject({
      status: 'verified',
      expected: 'video.mp4'
    });
    const pendingSnapshot = state.results;
    finishUpload();
    await job;
    expect(pendingSnapshot.find((r) => r.id === 'video.ready')?.status).toBe('running');
    expect(state.busy).toBe(false);
    expect(state.currentStep).toBeUndefined();
    expect(adapter.uploadVideo).toHaveBeenCalledExactlyOnceWith(
      video,
      expect.any(AbortSignal),
      uploadPage
    );
    expect(adapter.waitVideo).toHaveBeenCalledOnce();
    expect(adapter.applyField).toHaveBeenCalledOnce();
    expect(verifyField).toHaveBeenCalledOnce();
    expect(state.panelStatus).toBe('completed');
    expect(state.results.map((r) => [r.id, r.status])).toEqual([
      ['video.upload', 'verified'],
      ['editor.ready', 'verified'],
      ['info.title', 'verified'],
      ['video.ready', 'verified']
    ]);
    controller.dispose();
  }
);
it('keeps invalid original source for inspection without writing the page', async () => {
  const raw = '# kept comment\n[info]\ntitel="wrong"\n';
  selectFiles([file('p/bilipack.toml', raw)]);
  const adapter = mockAdapter(),
    controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((s) => {
    state = s;
  });
  await controller.importDirectory();
  expect(state.raw).toBe(raw);
  expect(state.results[0]).toMatchObject({
    id: 'info.titel',
    role: 'condition',
    status: 'blocked'
  });
  expect(state.panelStatus).toBe('error');
  expect(state.busy).toBe(false);
  expect(adapter.applyField).not.toHaveBeenCalled();
  controller.dispose();
});
it('prevents overlapping imports and cleans up on route change', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const adapter = mockAdapter(),
    controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((s) => {
    state = s;
  });
  const importJob = controller.importDirectory();
  await controller.importDirectory();
  expect(click).toHaveBeenCalledOnce();
  controller.updatePage({ ...adapter.context(), generation: 2 });
  await importJob;
  expect(document.querySelector('input[type=file]')).toBeNull();
  expect(state.busy).toBe(false);
  expect(adapter.applyField).not.toHaveBeenCalled();
  controller.dispose();
});
it('retains existing results if the next picker is cancelled', async () => {
  const click = selectFiles([file('p/bilipack.toml', '[info]\ntitle="x"')]);
  const adapter = mockAdapter(),
    controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((s) => {
    state = s;
  });
  await controller.importDirectory();
  expect(state.results[0]).toMatchObject({ id: 'video.upload', status: 'skipped' });
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
  const results = state.results;
  click.mockImplementation(function (this: HTMLInputElement) {
    this.dispatchEvent(new Event('cancel'));
  });
  await controller.importDirectory();
  expect(state.results).toBe(results);
  expect(state.raw).toContain('title');
  expect(state.canWrite).toBe(true);
  expect(state.panelStatus).toBe('awaiting-write');
  controller.clearSelection();
  await controller.writeConfiguration();
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(state.canWrite).toBe(false);
  controller.dispose();
});

it('retains the directory name on validation failure and clears only the local selection', async () => {
  selectFiles([file('视频包/bilipack.toml', '[info]\ntitel="wrong"')]);
  const adapter = mockAdapter(),
    controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory();
  expect(state.directoryName).toBe('视频包');
  expect(state.results).not.toHaveLength(0);
  controller.clearSelection();
  expect(state).toMatchObject({
    directoryName: null,
    raw: null,
    attachments: [],
    results: [],
    summary: ''
  });
  expect(adapter.applyField).not.toHaveBeenCalled();
  expect(adapter.uploadVideo).not.toHaveBeenCalled();
  controller.dispose();
});

it('does not clear an active import or lose the previous directory on picker cancellation', async () => {
  const click = selectFiles([file('视频包/bilipack.toml', '[info]\ntitle="x"')]);
  const controller = createController(mockAdapter());
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory();
  let picker!: HTMLInputElement;
  click.mockImplementation(function (this: HTMLInputElement) {
    picker = this;
  });
  const job = controller.importDirectory();
  controller.clearSelection();
  expect(state.directoryName).toBe('视频包');
  expect(state.busy).toBe(true);
  picker.dispatchEvent(new Event('cancel'));
  await job;
  expect(state.directoryName).toBe('视频包');
  expect(state.busy).toBe(false);
  controller.dispose();
});

it('settles live progress and preserves earlier subtitle evidence when a route changes while waiting for video', async () => {
  selectFiles([
    file('p/bilipack.toml', '[info]\ntitle="目标"\n[[subtitles]]\nlanguage="中文"\nfile="zh.srt"'),
    file('p/zh.srt', '1\n00:00:00,000 --> 00:00:01,000\n字幕\n')
  ]);
  const adapter = mockAdapter();
  adapter.waitVideo = vi.fn(
    (signal) =>
      new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('页面已变化')), { once: true });
      })
  );
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory();
  const job = controller.writeConfiguration();
  await vi.waitFor(() => expect(adapter.waitVideo).toHaveBeenCalledOnce());
  expect(state.busy).toBe(true);
  controller.updatePage({ ...adapter.context(), generation: 2 });
  await job;
  expect(state.busy).toBe(false);
  expect(state.currentStep).toBeUndefined();
  expect(
    state.results.some((r) => ['running', 'pending', 'verifying', 'waiting'].includes(r.status))
  ).toBe(false);
  expect(state.results.find((r) => r.id === 'subtitles.中文')?.status).toBe('verified');
  expect(state.results.find((r) => r.id === 'subtitles.中文')?.message).toBe('done');
  expect(state.panelStatus).toBe('interrupted');
  expect(adapter.applySubtitle).toHaveBeenCalledOnce();
  controller.dispose();
});

it.each(['ready', 'uploading'] as const)(
  'only compares an existing %s video until explicitly asked to write',
  async (video) => {
    selectFiles([file('p/bilipack.toml', '[info]\ntitle="目标"\ndescription="相同简介"')]);
    const values: Record<string, unknown> = {
      'info.title': '原有标题',
      'info.description': '相同简介'
    };
    const adapter = mockAdapter({
      context: () => ({
        identity: 'test',
        generation: 1,
        target: true,
        editor: true,
        count: 1,
        video
      }),
      verifyField: vi.fn(async (target) => ({
        matches: values[target.field] === target.value,
        actual: values[target.field],
        message: 'readback'
      })),
      applyField: vi.fn(async (target) => {
        values[target.field] = target.value;
      })
    });
    const controller = createController(adapter);
    let state!: ViewState;
    controller.subscribe((value) => {
      state = value;
    });
    await controller.importDirectory();
    expect(state.canWrite).toBe(true);
    expect(state.panelStatus).toBe('awaiting-write');
    expect(state.comparison).toBe(true);
    expect(state.results).toMatchObject([
      { id: 'video.upload', role: 'condition', status: 'skipped' },
      { id: 'info.title', status: 'different', expected: '目标', actual: '原有标题' },
      { id: 'info.description', status: 'verified', expected: '相同简介', actual: '相同简介' }
    ]);
    expect(adapter.applyField).not.toHaveBeenCalled();
    expect(adapter.uploadVideo).not.toHaveBeenCalled();
    expect(adapter.waitVideo).not.toHaveBeenCalled();
    expect(adapter.applyCovers).not.toHaveBeenCalled();
    expect(adapter.applySubtitle).not.toHaveBeenCalled();
    const write = controller.writeConfiguration();
    await controller.writeConfiguration();
    await write;
    expect(adapter.applyField).toHaveBeenCalledTimes(2);
    expect(adapter.uploadVideo).not.toHaveBeenCalled();
    expect(state.canWrite).toBe(false);
    expect(state.comparison).toBe(false);
    expect(state.busy).toBe(false);
    controller.dispose();
  }
);

it.each(['observed', 'unobserved'] as const)(
  'rejects a stale write after an %s page change',
  async (change) => {
    selectFiles([file('p/bilipack.toml', '[info]\ntitle="目标"')]);
    const adapter = mockAdapter();
    let page = adapter.context();
    adapter.context = () => ({ ...page });
    const controller = createController(adapter);
    let state!: ViewState;
    controller.subscribe((value) => {
      state = value;
    });
    await controller.importDirectory();
    expect(state.canWrite).toBe(true);
    expect(state.panelStatus).toBe('awaiting-write');
    page = { ...page, generation: 2 };
    if (change === 'observed') controller.updatePage(page);
    await controller.writeConfiguration();
    expect(state.canWrite).toBe(false);
    expect(state.panelStatus).toBe('interrupted');
    expect(adapter.applyField).not.toHaveBeenCalled();
    expect(adapter.uploadVideo).not.toHaveBeenCalled();
    controller.dispose();
  }
);

it('allows writing supported targets while skipping unsupported targets', async () => {
  selectFiles([file('p/bilipack.toml', '[info]\ntitle="目标"\ndescription="简介"')]);
  const adapter = mockAdapter({
    capability: (field) => ({ available: field !== 'info.description', reason: 'unsupported' })
  });
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory();
  expect(state.results.find((r) => r.id === 'info.title')?.status).toBe('different');
  expect(state.results.find((r) => r.id === 'info.description')?.status).toBe('skipped');
  expect(state.canWrite).toBe(true);
  await controller.writeConfiguration();
  expect(adapter.applyField).toHaveBeenCalledExactlyOnceWith(
    { field: 'info.title', value: '目标' },
    expect.any(AbortSignal),
    adapter.context()
  );
  expect(state.results.find((r) => r.id === 'info.description')?.status).toBe('skipped');
  controller.clearSelection();
  expect(state.directoryName).toBeNull();
  expect(state.canWrite).toBe(false);
  controller.dispose();
});

it('reports preparing and comparing separately, and removes the badge state on clear', async () => {
  let finishRead!: (raw: string) => void;
  const config = file('p/bilipack.toml');
  const read = new Promise<string>((resolve) => {
    finishRead = resolve;
  });
  // A delayed native file read makes preparation observable before comparison starts.
  const delayedFile = new File(['config'], 'bilipack.toml');
  Object.defineProperties(delayedFile, {
    webkitRelativePath: { value: config.webkitRelativePath },
    text: { value: () => read }
  });
  selectFiles([delayedFile]);
  let finishComparison!: () => void;
  const comparison = new Promise<void>((resolve) => {
    finishComparison = resolve;
  });
  const adapter = mockAdapter({
    verifyField: vi.fn(async () => {
      await comparison;
      return { matches: true, actual: '目标', message: '相同' };
    })
  });
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  const job = controller.importDirectory();
  await vi.waitFor(() => expect(state.directoryName).toBe('p'));
  expect(state.panelStatus).toBe('preparing');
  finishRead('[info]\ntitle="目标"');
  await vi.waitFor(() => expect(adapter.verifyField).toHaveBeenCalledOnce());
  expect(state.panelStatus).toBe('comparing');
  finishComparison();
  await job;
  expect(state.panelStatus).toBe('awaiting-write');
  controller.clearSelection();
  expect(state.panelStatus).toBeUndefined();
  controller.dispose();
});

it.each(['ready', 'absent'] as const)(
  'restores the same write action after failure on an initially %s page',
  async (initialVideo) => {
    selectFiles([
      file('p/bilipack.toml', '[video]\nfile="video.mp4"\n[info]\ntitle="目标"\ntags=["标签"]'),
      file('p/video.mp4')
    ]);
    const adapter = mockAdapter();
    let page = {
      ...adapter.context(),
      video: initialVideo as 'ready' | 'absent',
      count: initialVideo === 'absent' ? 0 : 1
    };
    adapter.context = () => ({ ...page });
    adapter.uploadVideo = vi.fn(async () => {
      page = { ...page, video: 'ready', count: 1 };
    });
    const apply = adapter.applyField;
    let failTags = true;
    const applyField = vi.fn<typeof adapter.applyField>(async (target, signal) => {
      if (target.field === 'info.tags' && failTags) throw new Error('标签输入被页面重置');
      await apply(target, signal, page);
    });
    adapter.applyField = applyField;
    const controller = createController(adapter);
    let state!: ViewState;
    controller.subscribe((value) => {
      state = value;
    });
    await controller.importDirectory();
    if (initialVideo === 'ready') await controller.writeConfiguration();
    expect(state.busy).toBe(false);
    expect(state.canWrite).toBe(true);
    expect(state.comparison).toBe(false);
    expect(state.results.find((r) => r.id === 'info.tags')?.status).toBe('failed');
    failTags = false;
    const job = controller.writeConfiguration();
    await controller.writeConfiguration();
    await job;
    expect(state.results.find((r) => r.id === 'info.tags')?.status).toBe('verified');
    expect(applyField.mock.calls.filter(([target]) => target.field === 'info.title')).toHaveLength(
      1
    );
    expect(applyField.mock.calls.filter(([target]) => target.field === 'info.tags')).toHaveLength(
      2
    );
    expect(adapter.uploadVideo).toHaveBeenCalledTimes(initialVideo === 'absent' ? 1 : 0);
    expect(state.busy).toBe(false);
    controller.dispose();
  }
);

it('invalidates the restored write action when the page changes after a failed write', async () => {
  selectFiles([file('p/bilipack.toml', '[info]\ntitle="目标"')]);
  const adapter = mockAdapter({
    applyField: vi.fn(async () => {
      throw new Error('temporary failure');
    })
  });
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  await controller.importDirectory();
  await controller.writeConfiguration();
  expect(state.canWrite).toBe(true);
  controller.updatePage({ ...adapter.context(), generation: 2 });
  await controller.writeConfiguration();
  expect(state.canWrite).toBe(false);
  expect(adapter.applyField).toHaveBeenCalledOnce();
  controller.dispose();
});

it('classifies an import exception as a condition failure before any target write', async () => {
  const adapter = mockAdapter();
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((s) => {
    state = s;
  });
  await controller.importDirectory(async () => {
    throw new Error('directory read failed');
  });
  expect(state.results).toMatchObject([
    { role: 'condition', status: 'failed', message: 'directory read failed' }
  ]);
  expect(state.panelStatus).toBe('error');
  expect(adapter.applyField).not.toHaveBeenCalled();
  controller.dispose();
});
