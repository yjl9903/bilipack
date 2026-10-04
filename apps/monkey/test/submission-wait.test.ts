import { expect, it, vi } from 'vitest';
import { isSubmissionWaiting, acceptsSubmissionCaption } from '../src/bilibili/submission';
import { run } from '../src/workflow/run';
import { context, mockAdapter } from './helpers';
import type { Step } from '../src/workflow/types';
import type { ViewState } from '../src/application/types';
import { createController } from '../src/application/controller';
import { file } from './helpers';

const waitText = '等待视频上传完后会自动提交，请勿关闭当前页面 取消自动提交';
it('does not classify an ordinary visible editor as submission waiting', () => {
  // Native wait markup may already exist, and user text may contain these words.
  expect(isSubmissionWaiting(waitText, false, 1, true)).toBe(false);
  expect(isSubmissionWaiting('上传中... 基本设置 标题', false, 1, true)).toBe(false);
  expect(isSubmissionWaiting('', false, 1, false)).toBe(false);
});
it('accepts a genuine visible wait screen even if hidden title markup remains', () => {
  expect(isSubmissionWaiting(waitText, false, 1, false)).toBe(true);
});
it('recognizes the native wait phase only for a single new submission', () => {
  expect(isSubmissionWaiting(waitText, false, 1)).toBe(true);
  expect(isSubmissionWaiting(waitText, true, 1)).toBe(false);
  expect(isSubmissionWaiting(waitText, false, 2)).toBe(false);

  expect(isSubmissionWaiting('取消自动提交', false, 1)).toBe(false);
});
it('accepts the entered-title caption without accepting a different task or route', () => {
  expect(acceptsSubmissionCaption(true, true, true, '填写标题', '文件名', '填写标题')).toBe(true);
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(true, false, true, '填写标题', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(true, true, true, '另一稿件', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(false, true, true, '填写标题', '文件名', '填写标题')).toBe(true);
});

it('accepts a rebuilt waiting task only with the same native video file title', () => {
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题', true)).toBe(
    true
  );
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题', false)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(true, false, false, '填写标题', '文件名', '填写标题', true)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(false, true, false, '填写标题', '文件名', '填写标题', true)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(true, true, false, '另一稿件', '文件名', '填写标题', true)).toBe(
    false
  );
});

it.each([false, true])(
  'preserves verified results on context loss even before waiting is recognized: %s',
  async (waiting) => {
    const adapter = mockAdapter();
    let page = { ...adapter.context(), submissionWaiting: false };
    adapter.context = () => page;
    const abort = new AbortController();
    const ctx = { ...context({}, adapter), signal: abort.signal };
    const read = vi.fn(() => ({ matches: true, actual: '目标标题', message: '一致' }));
    const results = await run(
      [
        {
          id: 'info.title',
          role: 'target' as const,
          dependsOn: [],
          execute: async () => {},
          verify: read
        },
        {
          id: 'video.ready',
          role: 'condition',
          allowDuringSubmission: true,
          dependsOn: [],
          execute: async () => {
            page = { ...page, generation: page.generation + 1, submissionWaiting: waiting };
            abort.abort();
            abort.signal.throwIfAborted();
          },
          verify: () => ({ matches: false, message: '未确认上传完成' })
        }
      ],
      ctx
    );
    expect(results[0]).toMatchObject({ status: 'verified', actual: '目标标题' });
    expect(results[0].message).toContain('此前已核验');
    expect(read).toHaveBeenCalledOnce();
    expect(results[1].status).not.toBe('verified');
  }
);

it('preserves prior evidence when context assertion fails before the lifecycle aborts', async () => {
  const adapter = mockAdapter();
  let page = { ...adapter.context(), submissionWaiting: false };
  adapter.context = () => page;
  adapter.assertContext = (expected) => {
    if (expected.generation !== page.generation) throw new Error('稿件标识变化');
  };
  const read = vi.fn(() => ({ matches: true, actual: '目标标题', message: '一致' }));
  const ctx = context({}, adapter);
  const results = await run(
    [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {},
        verify: read
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: async () => {
          page = { ...page, generation: page.generation + 1, submissionWaiting: true };
        },
        verify: () => ({ matches: true, message: '不应调用' })
      }
    ],
    ctx
  );
  expect(ctx.signal.aborted).toBe(false);
  expect(results[0]).toMatchObject({ status: 'verified', actual: '目标标题' });
  expect(read).toHaveBeenCalledOnce();
  expect(results[1].status).not.toBe('verified');
});

it.each([true, false])(
  'preserves verified fields while separately checking upload: %s',
  async (ready) => {
    const adapter = mockAdapter();
    let page = { ...adapter.context(), submissionWaiting: false };
    adapter.context = () => page;
    const verify = vi.fn(() => ({ matches: true, actual: '目标', message: '一致' }));
    const steps: Step[] = [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'cover.16:9',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'subtitles.中文',
        role: 'target' as const,
        dependsOn: [],
        execute: vi.fn(async () => {}),
        verify
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: async () => {
          page = { ...page, submissionWaiting: true, editor: false };
        },
        verify: () => ({ matches: ready, message: '上传独立核验' })
      }
    ];
    const results = await run(steps, context({}, adapter));
    expect(verify).toHaveBeenCalledTimes(3);
    expect(results.slice(0, 3).map((r) => r.status)).toEqual(['verified', 'verified', 'verified']);
    expect(results.slice(0, 3).every((r) => r.message.includes('投稿前已核验'))).toBe(true);
    expect(results.at(-1)?.status).toBe(ready ? 'verified' : 'unverified');
  }
);

it('stops remaining form operations after the user queues submission', async () => {
  const adapter = mockAdapter();
  let page = { ...adapter.context(), submissionWaiting: false };
  adapter.context = () => page;
  const laterWrite = vi.fn(async () => {}),
    laterRead = vi.fn(() => ({ matches: true, message: '' }));
  const results = await run(
    [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {
          page = { ...page, submissionWaiting: true };
        },
        verify: laterRead
      },
      {
        id: 'info.tags',
        role: 'target' as const,
        dependsOn: [],
        execute: laterWrite,
        verify: laterRead
      },
      {
        id: 'video.ready',
        role: 'condition',
        allowDuringSubmission: true,
        dependsOn: [],
        execute: (c) => adapter.waitVideo(c.signal, c.page),
        verify: adapter.verifyVideo
      }
    ],
    context({}, adapter)
  );
  expect(laterWrite).not.toHaveBeenCalled();
  expect(laterRead).not.toHaveBeenCalled();
  expect(results[0].status).toBe('failed');
  expect(results[1].status).toBe('blocked');
  expect(results[2].status).toBe('verified');
});

it('preserves earlier evidence when submission starts during final readback', async () => {
  const adapter = mockAdapter();
  let page = { ...adapter.context(), submissionWaiting: false },
    calls = 0;
  adapter.context = () => page;
  const results = await run(
    [
      {
        id: 'info.title',
        role: 'target' as const,
        dependsOn: [],
        execute: async () => {},
        verify: async () => {
          if (++calls === 2) {
            page = { ...page, submissionWaiting: true };
            throw new Error('表单已消失');
          }
          return { matches: true, actual: '已读回标题', message: '一致' };
        }
      }
    ],
    context({}, adapter)
  );
  expect(results[0]).toMatchObject({ status: 'verified', actual: '已读回标题' });
  expect(results[0].message).toContain('投稿前已核验');
});

it('keeps the panel visible and disables writes during native submission waiting', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      value: [file('p/bilipack.toml', '[info]\ntitle="目标"')]
    });
    this.dispatchEvent(new Event('change'));
  });
  const adapter = mockAdapter();
  let page = { ...adapter.context(), submissionWaiting: false, editor: true };
  adapter.context = () => page;
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  adapter.waitVideo = async () => {
    page = { ...page, submissionWaiting: true, editor: false };
    controller.updatePage(page);
    expect(state.panelStatus).toBe('submission-wait');
    expect(state.panelVisible).toBe(true);
    expect(state.canWrite).toBe(false);
  };
  try {
    await controller.importDirectory();
    await controller.writeConfiguration();
    expect(state.panelStatus).toBe('submission-wait');
    expect(state.results.find((r) => r.id === 'info.title')?.status).toBe('verified');
    expect(adapter.applyField).toHaveBeenCalledOnce();
    await controller.writeConfiguration();
    await controller.importDirectory();
    expect(click).toHaveBeenCalledOnce();
    expect(adapter.applyField).toHaveBeenCalledOnce();
  } finally {
    controller.dispose();
    click.mockRestore();
  }
});

it('retains pre-submission evidence if the platform leaves the page before upload can be confirmed', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      value: [file('p/bilipack.toml', '[info]\ntitle="目标"')]
    });
    this.dispatchEvent(new Event('change'));
  });
  const adapter = mockAdapter();
  let page = { ...adapter.context(), submissionWaiting: false, editor: true };
  adapter.context = () => page;
  const controller = createController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  adapter.waitVideo = async (signal) => {
    page = { ...page, submissionWaiting: true, editor: false };
    controller.updatePage(page);
    page = { ...page, target: false, identity: 'platform-next-page' };
    controller.updatePage(page);
    signal.throwIfAborted();
  };
  try {
    await controller.importDirectory();
    await controller.writeConfiguration();
    expect(state.results.find((r) => r.id === 'info.title')).toMatchObject({
      status: 'verified',
      actual: '目标'
    });
    expect(state.results.find((r) => r.id === 'video.ready')?.status).not.toBe('verified');
    expect(state.canWrite).toBe(false);
    expect(state.panelStatus).toBe('interrupted');
  } finally {
    controller.dispose();
    click.mockRestore();
  }
});
