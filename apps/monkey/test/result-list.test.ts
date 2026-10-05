import { createApp, nextTick, reactive } from 'vue';
import { expect, it } from 'vitest';
import ResultRow from '../src/panel/components/ui/ResultRow.vue';
import SelectedDirectoryCard from '../src/panel/SelectedDirectoryCard.vue';
import type { ViewState } from '../src/application/types';

it('keeps the write action visible and explains disabled states on hover and focus', async () => {
  const state = reactive<ViewState>({
    directoryName: 'example',
    visible: true,
    busy: false,
    canWrite: false,
    panelStatus: 'completed',
    raw: null,
    attachments: [],
    results: [],
    summary: '准备完成'
  });
  let writes = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(SelectedDirectoryCard, { state, onWrite: () => writes++ });
  try {
    app.mount(host);
    const button = host.querySelector<HTMLButtonElement>('.write-configuration')!;
    const action = host.querySelector<HTMLElement>('.write-action')!;
    expect(button.textContent).toContain('写入配置');
    expect(button.disabled).toBe(true);
    button.click();
    expect(writes).toBe(0);
    action.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('写入已完成');
    action.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    action.focus();
    await nextTick();
    expect(action.getAttribute('aria-describedby')).toBe(
      host.querySelector('[role="tooltip"]')?.id
    );
    state.busy = true;
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('请等待当前操作完成');
    state.busy = false;
    state.panelStatus = 'interrupted';
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('页面或稿件已变化');
    action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    state.panelStatus = 'attention';
    state.results = [
      { id: 'info.tags', role: 'target' as const, status: 'failed', message: '标签写入失败' }
    ];
    action.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('标签写入失败');
    state.canWrite = true;
    await nextTick();
    expect(host.querySelector('.write-configuration')).toBe(button);
    expect(button.disabled).toBe(false);
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    button.click();
    expect(writes).toBe(1);
  } finally {
    app.unmount();
    host.remove();
  }
});

it('shows complete truncated or multiline values on hover and focus, and dismisses stale tooltips', async () => {
  const result = reactive({
    id: 'info.description',
    role: 'target' as const,
    status: 'verified' as const,
    message: '一致',
    expected: '第一段\n\n第二段'
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ResultRow, { result });
  try {
    app.mount(host);
    const value = host.querySelector<HTMLElement>('.result-summary-value')!;
    value.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    const popup = host.querySelector('[role="tooltip"]')!;
    expect(popup.textContent).toBe(result.expected);
    expect(value.getAttribute('aria-describedby')).toBe(popup.id);
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    result.expected = '完整短文本';
    await nextTick();
    value.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    Object.defineProperties(value, { scrollWidth: { value: 500 }, clientWidth: { value: 100 } });
    value.focus();
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('完整短文本');
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    value.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    result.expected = '更新后的值';
    await nextTick();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
  } finally {
    app.unmount();
    host.remove();
  }
});

it('renders successes once on one row and lists only problems in the summary', async () => {
  const state = reactive<ViewState>({
    directoryName: 'example',
    visible: true,
    busy: false,
    raw: null,
    attachments: [],
    summary: '部分完成',
    results: [
      {
        id: 'info.category',
        role: 'target' as const,
        status: 'verified',
        message: '页面读回一致',
        expected: '动画',
        actual: '动画'
      },
      {
        id: 'info.declaration',
        role: 'target' as const,
        status: 'verified',
        message: '页面读回一致',
        expected: '内容无需标注',
        actual: '内容无需标注'
      },
      {
        id: 'info.title',
        role: 'target' as const,
        status: 'failed',
        message: '标题控件不可编辑',
        expected: '标题'
      },
      {
        id: 'info.tags',
        role: 'target' as const,
        status: 'different',
        message: '标签不同',
        expected: ['新标签'],
        actual: ['旧标签']
      },
      { id: 'cover.16:9', role: 'target' as const, status: 'unverified', message: '封面待核验' },
      { id: 'subtitles.中文', role: 'target' as const, status: 'blocked', message: '上传未完成' },
      { id: 'video.upload', role: 'target' as const, status: 'skipped', message: '页面已有视频' },
      { id: 'video.ready', role: 'target' as const, status: 'pending', message: '等待执行' },
      { id: 'editor.ready', role: 'target' as const, status: 'running', message: '执行中' }
    ]
  });
  const host = document.createElement('div');
  const app = createApp(SelectedDirectoryCard, { state });
  try {
    app.mount(host);
    const validation = host.querySelector('#bilipack-panel-validation')!;
    const successful = [...validation.querySelectorAll('.verified')];
    expect(successful).toHaveLength(2);
    expect(successful[0].querySelectorAll('.result-heading')).toHaveLength(1);
    expect(successful[0].textContent?.match(/动画/g)).toHaveLength(1);
    expect(successful[0].querySelector('.result-details')).toBeNull();
    expect(successful[0].querySelector('[aria-label="已完成"]')).not.toBeNull();
    expect(successful[1].textContent).toContain('创作声明');
    expect(validation.textContent).not.toContain('info.');
    expect([...validation.querySelectorAll('.result-name')].map((el) => el.textContent)).toEqual([
      '分区',
      '创作声明',
      '标题',
      '标签',
      '个人空间封面（16:9）',
      '字幕 中文',
      '选择视频',
      '视频上传状态'
    ]);
    expect(validation.textContent).not.toContain('页面读回一致');
    expect(validation.querySelector('.different')?.textContent).toContain('旧标签');
    const problems = host.querySelector('.summary-problems')!;
    expect(problems.querySelectorAll('.result-row')).toHaveLength(4);
    expect(problems.textContent).toContain('标题控件不可编辑');
    expect(problems.textContent).toContain('标签不同');
    expect(problems.querySelector('.verified,.skipped,.pending,.running')).toBeNull();
    state.results = [
      {
        id: 'info.category',
        role: 'target' as const,
        status: 'verified',
        message: '一致',
        expected: '动画'
      }
    ];
    state.comparison = true;
    await nextTick();
    expect(host.querySelector('.summary-problems')).toBeNull();
    expect(validation.querySelector('[aria-label="一致"]')).not.toBeNull();
  } finally {
    app.unmount();
  }
});

it('separates current values from targets with readable tags and preserved paragraphs', async () => {
  const result = reactive({
    id: 'info.tags',
    role: 'target' as const,
    status: 'different' as const,
    message: '有差异',
    actual: ['当前标签'] as string | string[],
    expected: ['目标标签'] as string | string[]
  });
  const host = document.createElement('div');
  const app = createApp(ResultRow, { result, comparison: true });
  try {
    app.mount(host);
    expect([...host.querySelectorAll('dt')].map((el) => el.textContent)).toEqual([
      '当前页面',
      '配置目标'
    ]);
    expect(host.querySelector('.comparison-block.current .tag-label')?.textContent).toBe(
      '当前标签'
    );
    expect(host.querySelector('.comparison-block.target .tag-label')?.textContent).toBe('目标标签');
    result.id = 'info.description';
    result.actual = '';
    result.expected = '第一段\n\n第二段';
    await nextTick();
    expect(host.querySelector('.current .comparison-text')?.textContent).toBe('（空）');
    expect(host.querySelector('.target .comparison-text')?.textContent).toBe('第一段\n\n第二段');
  } finally {
    app.unmount();
  }
});

it.each([
  { id: 'cover.16:9', expected: '个人空间.jpg' },
  { id: 'cover.4:3', expected: '首页推荐.jpg', actual: '4:3' },
  { id: 'subtitles.中文', expected: 'local.srt', actual: 'remote.srt' },
  { id: 'video.ready', expected: 'ready', actual: 'uploading' },
  { id: 'info.title', expected: '目标标题' },
  { id: 'info.title', expected: '相同标题', actual: '相同标题' }
])('omits meaningless comparison blocks for $id', (values) => {
  const host = document.createElement('div');
  const app = createApp(ResultRow, {
    result: { ...values, role: 'target', status: 'unverified', message: '保留问题原因' }
  });
  try {
    app.mount(host);
    expect(host.querySelector('.result-comparison')).toBeNull();
    expect(host.querySelector('.result-details')?.textContent).toContain('保留问题原因');
  } finally {
    app.unmount();
  }
});

it('highlights tag additions and removals without treating reordering as a difference', async () => {
  const result = reactive({
    id: 'info.tags',
    role: 'target' as const,
    status: 'different' as const,
    message: '有差异',
    actual: ['保留甲', '删除项', '保留乙'],
    expected: ['保留乙', '新增项', '保留甲']
  });
  const host = document.createElement('div');
  const app = createApp(ResultRow, { result, comparison: true });
  try {
    app.mount(host);
    expect(host.querySelectorAll('.comparison-tag.removed')).toHaveLength(1);
    expect(host.querySelector('.removed .tag-label')?.textContent).toBe('删除项');
    expect(host.querySelectorAll('.comparison-tag.added')).toHaveLength(1);
    expect(host.querySelector('.added .tag-label')?.textContent).toBe('新增项');
    expect(host.querySelectorAll('.comparison-tag:not(.added):not(.removed)')).toHaveLength(4);
    result.actual = ['保留甲', '新增项', '保留乙'];
    await nextTick();
    expect(host.querySelector('.result-comparison')).toBeNull();
  } finally {
    app.unmount();
  }
});
