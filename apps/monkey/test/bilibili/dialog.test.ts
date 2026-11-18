import { afterEach, expect, it, vi } from 'vitest';
import { captureDialogScroll } from '../../src/bilibili/dialog';
import { createOperation } from '../../src/bilibili/operation';
import type { PageContext } from '../../src/workflow/port';

const page: PageContext = {
  identity: 'draft',
  generation: 1,
  target: true,
  editor: true,
  count: 1,
  video: 'ready'
};
const operation = (signal = new AbortController().signal, read = () => page) =>
  createOperation(read, page, signal);

afterEach(() => document.body.removeAttribute('style'));

it('restores the pre-dialog overflow without changing unrelated page styles', async () => {
  document.body.style.setProperty('overflow-x', 'auto', 'important');
  document.body.style.setProperty('overflow-y', 'scroll', 'important');
  const restore = captureDialogScroll(document);
  document.body.style.overflow = 'hidden';
  document.body.style.color = 'red';
  await restore(operation());
  expect(document.body.style.overflowX).toBe('auto');
  expect(document.body.style.overflowY).toBe('scroll');
  expect(document.body.style.getPropertyPriority('overflow-y')).toBe('important');
  expect(document.body.style.color).toBe('red');
});

it('clears a leftover lock before the next dialog captures its initial state', async () => {
  for (let i = 0; i < 3; i++) {
    const restore = captureDialogScroll(document);
    document.body.style.overflow = 'hidden';
    await restore(operation());
    expect(document.body.style.overflow).toBe('');
  }
});

it.each(['hidden', 'clip'])('preserves a pre-existing %s scroll lock', async (value) => {
  document.body.style.overflow = value;
  const restore = captureDialogScroll(document);
  document.body.style.overflow = 'hidden';
  await restore(operation());
  expect(document.body.style.overflow).toBe('hidden');
});

it('keeps the native restored value when no hidden lock remains', async () => {
  const restore = captureDialogScroll(document);
  document.body.style.overflow = 'scroll';
  await restore(operation());
  expect(document.body.style.overflow).toBe('scroll');
});

it('waits for another dialog to close before releasing the page', async () => {
  vi.useFakeTimers();
  const restore = captureDialogScroll(document);
  document.body.style.overflow = 'hidden';
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.getClientRects = () => [{}] as unknown as DOMRectList;
  document.body.append(dialog);
  const done = vi.fn();
  const job = restore(operation()).then(done);
  await vi.advanceTimersByTimeAsync(300);
  expect(document.body.style.overflow).toBe('hidden');
  expect(done).not.toHaveBeenCalled();
  dialog.remove();
  await vi.advanceTimersByTimeAsync(100);
  await job;
  expect(document.body.style.overflow).toBe('');
});

it('leaves an open dialog locked when waiting times out', async () => {
  vi.useFakeTimers();
  const restore = captureDialogScroll(document);
  document.body.style.overflow = 'hidden';
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.getClientRects = () => [{}] as unknown as DOMRectList;
  document.body.append(dialog);
  const failed = expect(restore(operation())).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(5000);
  await failed;
  expect(document.body.style.overflow).toBe('hidden');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['abort', 'context'] as const)(
  'does not restore after %s invalidates the operation',
  async (kind) => {
    const restore = captureDialogScroll(document);
    document.body.style.overflow = 'hidden';
    const abort = new AbortController();
    if (kind === 'abort') abort.abort();
    const read = () => (kind === 'context' ? { ...page, generation: 2 } : page);
    await expect(restore(operation(abort.signal, read))).rejects.toThrow();
    expect(document.body.style.overflow).toBe('hidden');
  }
);
