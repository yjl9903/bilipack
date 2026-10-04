import { afterEach, it, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import FloatingPanel from '../src/panel/components/ui/FloatingPanel.vue';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
function mountPanel() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(FloatingPanel);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
}
function pointer(target: HTMLElement, type: string, x: number, y: number) {
  target.setPointerCapture ??= vi.fn();
  target.hasPointerCapture ??= () => true;
  target.releasePointerCapture ??= vi.fn();
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}
function drag(target: HTMLElement, dx: number, dy: number) {
  pointer(target, 'pointerdown', 0, 0);
  pointer(target, 'pointermove', dx, dy);
  pointer(target, 'pointerup', dx, dy);
}
it('starts with an icon and toggles without text expand/collapse buttons', async () => {
  const host = mountPanel(),
    panel = host.querySelector('aside')!;
  expect(panel.style.display).toBe('none');
  const launcher = host.querySelector<HTMLButtonElement>('.launcher')!;
  expect(launcher.querySelector('svg')).not.toBeNull();
  expect(launcher.textContent).toBe('');
  launcher.click();
  await nextTick();
  expect(host.querySelector('.launcher')).toBeNull();
  expect(panel.style.display).not.toBe('none');
  const collapse = host.querySelector<HTMLButtonElement>('.collapse-button')!;
  expect(collapse.textContent).toBe('');
  expect(collapse.querySelector('svg')).not.toBeNull();
  collapse.click();
  await nextTick();
  expect(host.querySelector('.launcher')).not.toBeNull();
});
it('drags the icon within the viewport without opening it on release', async () => {
  const host = mountPanel(),
    launcher = host.querySelector<HTMLElement>('.launcher')!;
  drag(launcher, -5000, -5000);
  await nextTick();
  expect(launcher.style.left).toBe('12px');
  expect(launcher.style.top).toBe('12px');
  launcher.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  await nextTick();
  expect(host.querySelector('aside')!.style.display).toBe('none');
  pointer(launcher, 'pointerdown', 0, 0);
  pointer(launcher, 'pointerup', 0, 0);
  launcher.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  await nextTick();
  expect(host.querySelector('aside')!.style.display).not.toBe('none');
});
it('moves the panel, resizes it, and retains its dimensions through collapse', async () => {
  const host = mountPanel();
  host.querySelector<HTMLButtonElement>('.launcher')!.click();
  await nextTick();
  const panel = host.querySelector('aside')!,
    header = host.querySelector<HTMLElement>('header')!;
  drag(header, -5000, -5000);
  await nextTick();
  expect(panel.style.left).toBe('12px');
  expect(panel.style.top).toBe('12px');
  expect(host.querySelector('.resize-handle')).toBeNull();
  const right = host.querySelector<HTMLElement>('.resize-edge-right')!;
  const bottom = host.querySelector<HTMLElement>('.resize-edge-bottom')!;
  drag(right, 120, 0);
  drag(bottom, 0, 60);
  await nextTick();
  expect(panel.style.width).toBe('520px');
  expect(panel.style.height).toBe('620px');
  host.querySelector<HTMLButtonElement>('.collapse-button')!.click();
  await nextTick();
  host.querySelector<HTMLButtonElement>('.launcher')!.click();
  await nextTick();
  expect(panel.style.width).toBe('520px');
  expect(panel.style.height).toBe('620px');
  drag(right, -5000, 0);
  drag(bottom, 0, -5000);
  await nextTick();
  expect(panel.style.width).toBe('300px');
  expect(panel.style.height).toBe('240px');
  right.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await nextTick();
  expect(panel.style.width).toBe('316px');
});
it('keeps controls reachable after the viewport shrinks and removes its listener', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const host = mountPanel();
  host.querySelector<HTMLButtonElement>('.launcher')!.click();
  await nextTick();
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(400);
  window.dispatchEvent(new Event('resize'));
  await nextTick();
  const panel = host.querySelector('aside')!;
  expect(parseFloat(panel.style.left) + parseFloat(panel.style.width)).toBeLessThanOrEqual(308);
  expect(parseFloat(panel.style.top) + parseFloat(panel.style.height)).toBeLessThanOrEqual(388);
  cleanups.pop()!();
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
});

it.each([
  { edge: 'left', dx: -40, dy: 0, horizontal: true, leading: true },
  { edge: 'right', dx: 40, dy: 0, horizontal: true, leading: false },
  { edge: 'top', dx: 0, dy: -40, horizontal: false, leading: true },
  { edge: 'bottom', dx: 0, dy: 40, horizontal: false, leading: false }
])(
  'resizes the $edge edge while anchoring its opposite edge and enforcing limits',
  async ({ edge, dx, dy, horizontal, leading }) => {
    const host = mountPanel();
    host.querySelector<HTMLButtonElement>('.launcher')!.click();
    await nextTick();
    const panel = host.querySelector('aside')!;
    drag(host.querySelector<HTMLElement>('.resize-edge-right')!, -5000, 0);
    drag(host.querySelector<HTMLElement>('.resize-edge-bottom')!, 0, -5000);
    drag(host.querySelector<HTMLElement>('header')!, -5000, -5000);
    drag(host.querySelector<HTMLElement>('header')!, 100, 100);
    await nextTick();
    const rect = () => ({
      x: parseFloat(panel.style.left),
      y: parseFloat(panel.style.top),
      width: parseFloat(panel.style.width),
      height: parseFloat(panel.style.height)
    });
    const before = rect();
    const handle = host.querySelector<HTMLElement>(`.resize-edge-${edge}`)!;
    drag(handle, dx, dy);
    await nextTick();
    const after = rect();
    if (horizontal) {
      expect(after.width).toBe(before.width + 40);
      expect(after.height).toBe(before.height);
      expect(after.y).toBe(before.y);
      expect(leading ? after.x + after.width : after.x).toBe(
        leading ? before.x + before.width : before.x
      );
    } else {
      expect(after.height).toBe(before.height + 40);
      expect(after.width).toBe(before.width);
      expect(after.x).toBe(before.x);
      expect(leading ? after.y + after.height : after.y).toBe(
        leading ? before.y + before.height : before.y
      );
    }
    drag(handle, -dx * 1000, -dy * 1000);
    await nextTick();
    expect(horizontal ? rect().width : rect().height).toBe(horizontal ? 300 : 240);
    drag(handle, dx * 1000, dy * 1000);
    await nextTick();
    const maximum = rect();
    expect(maximum.x).toBeGreaterThanOrEqual(12);
    expect(maximum.y).toBeGreaterThanOrEqual(12);
    expect(maximum.x + maximum.width).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(maximum.y + maximum.height).toBeLessThanOrEqual(window.innerHeight - 12);
  }
);

it.each([
  { corner: 'top-left', dx: -40, dy: -40 },
  { corner: 'top-right', dx: 40, dy: -40 },
  { corner: 'bottom-left', dx: -40, dy: 40 },
  { corner: 'bottom-right', dx: 40, dy: 40 }
])(
  'resizes both axes from $corner while anchoring the opposite corner',
  async ({ corner, dx, dy }) => {
    const host = mountPanel();
    host.querySelector<HTMLButtonElement>('.launcher')!.click();
    await nextTick();
    drag(host.querySelector<HTMLElement>('.resize-edge-right')!, -5000, 0);
    drag(host.querySelector<HTMLElement>('.resize-edge-bottom')!, 0, -5000);
    drag(host.querySelector<HTMLElement>('header')!, -5000, -5000);
    drag(host.querySelector<HTMLElement>('header')!, 100, 100);
    await nextTick();
    const panel = host.querySelector('aside')!;
    const rect = () => ({
      x: parseFloat(panel.style.left),
      y: parseFloat(panel.style.top),
      width: parseFloat(panel.style.width),
      height: parseFloat(panel.style.height)
    });
    const before = rect();
    const handle = host.querySelector<HTMLElement>(`.resize-corner-${corner}`)!;
    expect(host.querySelectorAll('.resize-corner')).toHaveLength(4);
    drag(handle, dx, dy);
    await nextTick();
    const after = rect();
    expect(after.width).toBe(before.width + 40);
    expect(after.height).toBe(before.height + 40);
    expect(dx < 0 ? after.x + after.width : after.x).toBe(
      dx < 0 ? before.x + before.width : before.x
    );
    expect(dy < 0 ? after.y + after.height : after.y).toBe(
      dy < 0 ? before.y + before.height : before.y
    );
    drag(handle, -dx * 1000, -dy * 1000);
    await nextTick();
    expect(rect().width).toBe(300);
    expect(rect().height).toBe(240);
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: dx < 0 ? 'ArrowLeft' : 'ArrowRight', bubbles: true })
    );
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: dy < 0 ? 'ArrowUp' : 'ArrowDown', bubbles: true })
    );
    await nextTick();
    expect(rect().width).toBe(316);
    expect(rect().height).toBe(256);
    drag(handle, dx * 1000, dy * 1000);
    await nextTick();
    const maximum = rect();
    expect(maximum.x).toBeGreaterThanOrEqual(12);
    expect(maximum.y).toBeGreaterThanOrEqual(12);
    expect(maximum.x + maximum.width).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(maximum.y + maximum.height).toBeLessThanOrEqual(window.innerHeight - 12);
  }
);

it('uses the same bottom-right anchor when expanding and collapsing after moving and resizing', async () => {
  const host = mountPanel();
  const point = (element: HTMLElement, width: number, height: number) => ({
    x: parseFloat(element.style.left) + width,
    y: parseFloat(element.style.top) + height
  });
  const launcher = host.querySelector<HTMLElement>('.launcher')!;
  const original = point(launcher, 48, 48);
  launcher.click();
  await nextTick();
  const panel = host.querySelector<HTMLElement>('aside')!;
  expect(point(panel, 400, 560)).toEqual(original);
  drag(host.querySelector<HTMLElement>('header')!, -100, -100);
  drag(host.querySelector<HTMLElement>('.resize-corner-bottom-right')!, -50, -50);
  await nextTick();
  const width = parseFloat(panel.style.width),
    height = parseFloat(panel.style.height);
  const anchor = point(panel, width, height);
  const placement = { left: panel.style.left, top: panel.style.top };
  host.querySelector<HTMLButtonElement>('.collapse-button')!.click();
  await nextTick();
  expect(point(host.querySelector<HTMLElement>('.launcher')!, 48, 48)).toEqual(anchor);
  // Leaving geometry must not jump to the launcher before the animation finishes.
  expect({ left: panel.style.left, top: panel.style.top }).toEqual(placement);
  expect(panel.hasAttribute('inert')).toBe(true);
  host.querySelector<HTMLButtonElement>('.launcher')!.click();
  await nextTick();
  expect(point(panel, width, height)).toEqual(anchor);
  expect(panel.hasAttribute('inert')).toBe(false);
  expect(panel.getAttribute('aria-hidden')).toBe('false');
});

it('clamps a panel opened near the top-left while animating from the actual launcher', async () => {
  const host = mountPanel();
  const launcher = host.querySelector<HTMLElement>('.launcher')!;
  drag(launcher, -5000, -5000);
  await nextTick();
  launcher.click();
  await nextTick();
  const panel = host.querySelector<HTMLElement>('aside')!;
  expect(panel.style.left).toBe('12px');
  expect(panel.style.top).toBe('12px');
  expect(
    parseFloat(panel.style.left) +
      400 +
      parseFloat(panel.style.getPropertyValue('--panel-offset-x'))
  ).toBe(60);
  expect(
    parseFloat(panel.style.top) + 560 + parseFloat(panel.style.getPropertyValue('--panel-offset-y'))
  ).toBe(60);
});
