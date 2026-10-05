import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import App from '../src/panel/App.vue';
import { createController } from '../src/application/controller';
import { file, mockAdapter } from './helpers';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
async function mountApp(adapter = mockAdapter()) {
  const controller = createController(adapter);
  controller.updatePage({
    target: true,
    editor: true,
    video: 'ready',
    count: 1,
    identity: 'test',
    generation: 1
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(App, { controller });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    controller.dispose();
    host.remove();
  });
  host.querySelector<HTMLButtonElement>('.launcher')!.click();
  await nextTick();
  return { host, controller };
}
it('switches title to the selected directory, separates tabs and removes selection', async () => {
  const { host } = await mountApp();
  expect(host.querySelector('.panel-title')?.textContent?.trim()).toBe('选择 Bilipack 目录');
  expect(host.querySelector('.panel-status')).toBeNull();
  expect(host.querySelector('.clear-selection')).toBeNull();
  expect(host.querySelector('.body .primary')).toBeNull();
  expect(host.querySelector('.upload-directory-card')).not.toBeNull();
  expect(host.querySelector('.selected-directory-card')).toBeNull();
  expect(host.querySelector('[role=tablist]')).toBeNull();
  const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
  host.querySelector<HTMLElement>('.panel-title')!.click();
  expect(picker).not.toHaveBeenCalled();
  const raw = '# 注释保留\n[info]\ntitle="x"';
  picker.mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, 'files', { value: [file('我的视频包/bilipack.toml', raw)] });
    this.dispatchEvent(new Event('change'));
  });
  host.querySelector<HTMLButtonElement>('.directory-upload')!.click();
  await vi.waitFor(() =>
    expect(host.querySelector('.summary-message')?.textContent).toContain('比对完成')
  );
  await nextTick();
  expect(host.querySelector('.panel-title')?.textContent?.trim()).toBe('我的视频包');
  expect(host.querySelector('.panel-status')?.textContent?.trim()).toBe('待写入');
  expect(host.querySelector('.upload-directory-card')).toBeNull();
  expect(host.querySelector('.selected-directory-card')).not.toBeNull();
  expect(host.querySelector('.write-configuration')).not.toBeNull();
  expect(host.querySelector('header .clear-selection')).toBeNull();
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
    '总结',
    '校验',
    '配置',
    '视频',
    '封面'
  ]);
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  tabs[1].click();
  await nextTick();
  expect(host.querySelector<HTMLElement>('#bilipack-panel-summary')!.style.display).toBe('none');
  expect(host.querySelector<HTMLElement>('#bilipack-panel-validation')!.style.display).not.toBe(
    'none'
  );
  expect(host.querySelector('#bilipack-panel-validation')?.textContent).toContain('标题');
  tabs[2].click();
  await nextTick();
  expect(host.querySelector('#bilipack-panel-config code')?.textContent).toBe(raw);
  tabs[3].click();
  await nextTick();
  expect(host.querySelector<HTMLElement>('#bilipack-panel-video')!.style.display).not.toBe('none');
  expect(host.querySelector('#bilipack-panel-video')?.textContent).toContain('暂无视频');
  expect(host.querySelector('#bilipack-tab-subtitle')).toBeNull();
  const clear = host.querySelector<HTMLButtonElement>('.clear-selection')!;
  tabs[0].click();
  await nextTick();
  expect(clear.textContent?.trim()).toBe('取消选择');
  expect(clear.getAttribute('aria-label')).toBe('去除目录选择');
  expect(clear.title).toBe('去除目录选择');
  expect(clear.querySelector('svg')).not.toBeNull();
  expect(host.querySelector('#bilipack-panel-summary .clear-selection')).toBe(clear);
  clear.click();
  await nextTick();
  expect(host.querySelector('.panel-title')?.textContent?.trim()).toBe('选择 Bilipack 目录');
  expect(host.querySelector('.panel-status')).toBeNull();
  expect(host.querySelector('.clear-selection')).toBeNull();
  expect(host.querySelector('.body .primary')).toBeNull();
  expect(host.querySelector('.upload-directory-card')).not.toBeNull();
  expect(host.querySelector('.selected-directory-card')).toBeNull();
  expect(host.querySelector('[role=tablist]')).toBeNull();
  expect(host.querySelector('code')).toBeNull();
});
it('supports arrow-key navigation between tabs with a single tab stop', async () => {
  const { host } = await mountApp();
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      value: [file('视频包/bilipack.toml', '[info]\ntitle="x"')]
    });
    this.dispatchEvent(new Event('change'));
  });
  host.querySelector<HTMLButtonElement>('.directory-upload')!.click();
  await vi.waitFor(() => expect(host.querySelector('[role=tab]')).not.toBeNull());
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await nextTick();
  expect(tabs[4].getAttribute('aria-selected')).toBe('true');
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
  expect(document.activeElement).toBe(tabs[4]);
  tabs[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await nextTick();
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
});

it('shows live execution in the title, summary and validation until the run ends', async () => {
  const adapter = mockAdapter();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const apply = adapter.applyField;
  adapter.applyField = vi.fn<typeof adapter.applyField>(async (...args) => {
    await gate;
    await apply(...args);
  });
  const { host, controller } = await mountApp(adapter);
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', { value: [file('p/bilipack.toml', '[info]\ntitle="x"')] });
    this.dispatchEvent(new Event('change'));
  });
  await controller.importDirectory();
  await nextTick();
  expect(adapter.applyField).not.toHaveBeenCalled();
  host.querySelector<HTMLButtonElement>('.write-configuration')!.click();
  await vi.waitFor(() => expect(adapter.applyField).toHaveBeenCalledOnce());
  await nextTick();
  expect(host.querySelector('.panel-status')?.textContent?.trim()).toBe('执行中');
  expect(host.querySelector('.panel-status .loading-spinner')).not.toBeNull();
  expect(host.querySelector('.panel-heading > .loading-spinner')).toBeNull();
  expect(host.querySelector('.progress-message')?.textContent).toContain('正在执行：填写标题');
  host.querySelector<HTMLButtonElement>('#bilipack-tab-validation')!.click();
  await nextTick();
  expect(host.querySelector('#bilipack-panel-validation .running')?.textContent).toContain('标题');
  expect(host.querySelector('#bilipack-panel-validation .pending')?.textContent).toContain(
    '视频上传状态'
  );
  finish();
  await vi.waitFor(() =>
    expect(host.querySelector('.summary-message')?.textContent).toContain('确认后自行提交或保存')
  );
  await nextTick();
  expect(host.querySelector('.panel-heading .loading-spinner')).toBeNull();
  expect(host.querySelector('.panel-status')?.textContent?.trim()).toBe('填写完成');
  expect(host.querySelector('.progress-message')).toBeNull();
  expect(host.querySelector('#bilipack-panel-validation .running')).toBeNull();
  expect(
    host.querySelector('#bilipack-panel-validation .verified [aria-label="已完成"]')
  ).not.toBeNull();
});

it('keeps writing enabled for unsupported targets and lists them as skipped', async () => {
  const adapter = mockAdapter({
    capability: () => ({ available: false, reason: '当前封面模式不支持写入' })
  });
  const { host, controller } = await mountApp(adapter);
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', { value: [file('p/bilipack.toml', '[info]\ntitle="x"')] });
    this.dispatchEvent(new Event('change'));
  });
  await controller.importDirectory();
  await nextTick();
  const write = host.querySelector<HTMLButtonElement>('.write-configuration')!;
  expect(write).not.toBeNull();
  expect(write.disabled).toBe(false);
  expect(host.querySelector('.summary-skipped')?.textContent).toContain('当前封面模式不支持写入');
  expect(host.textContent).not.toContain('检查校验结果与原生表单后，请自行投稿或保存修改。');
  await controller.writeConfiguration();
  expect(adapter.applyField).not.toHaveBeenCalled();
});

it('uses the same write button after an unsuccessful write', async () => {
  const adapter = mockAdapter();
  const apply = adapter.applyField;
  adapter.applyField = vi
    .fn<typeof adapter.applyField>()
    .mockRejectedValueOnce(new Error('暂时失败'))
    .mockImplementation(apply);
  const { host, controller } = await mountApp(adapter);
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', { value: [file('p/bilipack.toml', '[info]\ntitle="x"')] });
    this.dispatchEvent(new Event('change'));
  });
  await controller.importDirectory();
  await controller.writeConfiguration();
  await nextTick();
  const write = host.querySelector<HTMLButtonElement>('.write-configuration')!;
  expect(write.textContent?.trim()).toBe('写入配置');
  expect(write.disabled).toBe(false);
  expect(host.querySelectorAll('.write-configuration')).toHaveLength(1);
  write.click();
  await vi.waitFor(() =>
    expect(host.querySelector('.summary-message')?.textContent).toContain('确认后自行提交或保存')
  );
  expect(adapter.applyField).toHaveBeenCalledTimes(2);
});
