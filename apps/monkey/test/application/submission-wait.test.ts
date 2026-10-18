import { expect, it, vi } from 'vitest';
import { context } from '../support/run-context';
import { fakeAdapter } from '../support/page-adapter';
import type { ViewState } from '../../src/application/types';
import { createTestController } from '../support/controller';
import { file } from '../support/fixtures';
it('keeps the panel visible and disables writes during native submission waiting', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      value: [file('p/bilipack.toml', '[info]\ntitle="目标"')]
    });
    this.dispatchEvent(new Event('change'));
  });
  const adapter = fakeAdapter();
  let page = { ...adapter.context(), submissionWaiting: false, editor: true };
  adapter.context = () => page;
  const controller = createTestController(adapter);
  let state!: ViewState;
  controller.subscribe((value) => {
    state = value;
  });
  adapter.waitVideo = async () => {
    page = { ...page, submissionWaiting: true, editor: false };
    controller.updatePage(page);
    expect(state.panelStatus).toBe('video-wait');
    expect(state.panelVisible).toBe(true);
    expect(state.canWrite).toBe(false);
  };
  try {
    await controller.importDirectory();
    await controller.writeConfiguration();
    expect(state.panelStatus).toBe('completed');
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
  const adapter = fakeAdapter();
  let page = { ...adapter.context(), submissionWaiting: false, editor: true };
  adapter.context = () => page;
  const controller = createTestController(adapter);
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
