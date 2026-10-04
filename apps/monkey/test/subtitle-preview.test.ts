import { expect, it } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import SubtitlePreview from '../src/panel/components/subtitle/SubtitlePreview.vue';
import type { SubtitleAttachment } from '../src/application/types';

it('offers only supplied subtitle languages and switches filename and raw preview together', async () => {
  const chinese = '1\r\n00:00:00,000 --> 00:00:01,000\r\n你好\r\n';
  const english = '1\n00:00:00,000 --> 00:00:01,000\n<img src=x onerror=alert(1)>\n';
  const props = reactive<{ files: SubtitleAttachment[] }>({
    files: [
      {
        type: 'subtitle',
        language: '中文',
        name: 'pack/subtitles/zh.srt',
        source: chinese,
        size: 30,
        kind: '字幕 · 中文'
      },
      {
        type: 'subtitle',
        language: '英语',
        name: 'pack/subtitles/en.srt',
        source: english,
        size: 40,
        kind: '字幕 · 英语'
      }
    ]
  });
  const host = document.createElement('div');
  const app = createApp({ render: () => h(SubtitlePreview, props) });
  try {
    app.mount(host);
    const select = host.querySelector<HTMLButtonElement>('[role=combobox]')!;
    expect(host.querySelector('select')).toBeNull();
    select.click();
    await nextTick();
    expect(
      [...host.querySelectorAll('[role=option]')].map((option) => option.textContent?.trim())
    ).toEqual(['中文', '英语']);
    expect(host.querySelector('label')?.htmlFor).toBe(select.id);
    expect(host.querySelector('.file-name')?.textContent).toBe('zh.srt');
    expect(host.querySelectorAll('pre')).toHaveLength(1);
    expect(host.querySelector('pre.shiki.github-light code')?.textContent).toBe(chinese);
    host.querySelectorAll<HTMLElement>('[role=option]')[1].click();
    await nextTick();
    expect(host.querySelector('.file-name')?.textContent).toBe('en.srt');
    expect(host.querySelector('code')?.textContent).toBe(english);
    expect(host.querySelector('img')).toBeNull();
    const filename = host.querySelector<HTMLElement>('.file-name')!;
    Object.defineProperties(filename, { scrollWidth: { value: 200 }, clientWidth: { value: 80 } });
    filename.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')?.textContent).toBe('en.srt');
    props.files = props.files.slice(0, 1);
    await nextTick();
    expect(select.textContent?.trim()).toBe('中文');
    select.click();
    await nextTick();
    expect(host.querySelectorAll('[role=option]')).toHaveLength(1);
    expect(host.querySelector('.file-name')?.textContent).toBe('zh.srt');
    expect(host.querySelector('code')?.textContent).toBe(chinese);
    expect(host.querySelector('[role=tooltip]')).toBeNull();
  } finally {
    app.unmount();
  }
});
