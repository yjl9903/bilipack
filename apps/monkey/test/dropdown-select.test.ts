import { expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import DropdownSelect from '../src/panel/components/ui/DropdownSelect.vue';

it('supports keyboard selection, cancellation and outside dismissal inside a shadow root', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  shadow.append(mount);
  const selected = ref('中文');
  const app = createApp({
    render: () =>
      h(DropdownSelect, {
        id: 'language',
        label: '字幕语言',
        options: ['中文', '英语', '日语'],
        modelValue: selected.value,
        'onUpdate:modelValue': (value) => {
          selected.value = value;
        }
      })
  });
  try {
    app.mount(mount);
    const trigger = shadow.querySelector<HTMLButtonElement>('[role=combobox]')!;
    const key = async (value: string) => {
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
      );
      await nextTick();
    };
    trigger.focus();
    await key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await key('End');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('language-option-2');
    await key('Escape');
    expect(selected.value).toBe('中文');
    expect(shadow.querySelector('[role=listbox]')).toBeNull();
    await key(' ');
    await key('ArrowDown');
    await key('Enter');
    expect(selected.value).toBe('英语');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(shadow.activeElement).toBe(trigger);
    trigger.click();
    await nextTick();
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await nextTick();
    expect(shadow.querySelector('[role=listbox]')).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await nextTick();
    expect(shadow.querySelector('[role=listbox]')).toBeNull();
    trigger.click();
    await nextTick();
    await key('Home');
    await key('Tab');
    expect(selected.value).toBe('英语');
    expect(shadow.querySelector('[role=listbox]')).toBeNull();
  } finally {
    app.unmount();
    host.remove();
  }
});
