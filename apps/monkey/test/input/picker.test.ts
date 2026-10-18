import { it, expect, vi } from 'vitest';
import { pickDirectory } from '../../src/input/picker';

it('opens the native picker synchronously and cleans up cancellation', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    expect(this.webkitdirectory).toBe(true);
    this.dispatchEvent(new Event('cancel'));
  });
  const selection = pickDirectory(new AbortController().signal);
  expect(click).toHaveBeenCalledOnce();
  expect(await selection).toBeNull();
  expect(document.querySelector('input[type=file]')).toBeNull();
  click.mockRestore();
});
