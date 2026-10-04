import { it, expect, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import SelectedDirectoryCard from '../src/panel/SelectedDirectoryCard.vue';
import type { ViewState } from '../src/application/types';
import CodePreview from '../src/panel/components/ui/CodePreview.vue';
vi.mock('../src/panel/utils/shiki-cdn', () => ({
  loadHighlighter: vi.fn().mockRejectedValue(new Error('CDN unavailable'))
}));
it('renders exact raw TOML including comments and hostile markup as readonly text', () => {
  const source = '# 原始注释\r\n[info]\r\ntitle = "<img src=x onerror=alert(1)>"\r\n\r\n';
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(CodePreview, { source });
  app.mount(host);
  expect(host.querySelector('code')?.textContent).toBe(source);
  expect(host.querySelector('img,input,textarea,[contenteditable]')).toBeNull();
  expect(host.querySelector('code span')).toBeNull();
  expect(host.querySelector('details,summary')).toBeNull();
  const pre = host.querySelector<HTMLPreElement>('pre.shiki.github-light');
  expect(pre?.style.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(pre?.style.color).toBe('rgb(36, 41, 46)');
  app.unmount();
  host.remove();
});

it('separates media tabs, renders subtitle text safely and releases video previews', async () => {
  const createObjectURL = vi.fn(() => 'blob:local-video');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  const source = '1\r\n00:00:00,000 --> 00:00:02,000\r\n<img src=x onerror=alert(1)>\r\n';
  const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
  const state = reactive<ViewState>({
    directoryName: 'example',
    visible: true,
    busy: false,
    raw: '[info]',
    summary: '',
    results: [],
    attachments: [
      {
        type: 'video',
        file: video,
        name: 'videos/clip.mp4',
        size: 5,
        kind: '视频'
      },
      {
        type: 'cover',
        url: 'blob:cover',
        name: 'cover.png',
        size: 10,
        kind: '封面',
        cover: {
          ratio: '16:9',
          source: { mode: 'dual', file: new File(['cover'], 'cover.png'), width: 1600, height: 900 }
        }
      },
      { type: 'subtitle', language: 'zh', source, name: 'zh.srt', size: 20, kind: '字幕 · zh' }
    ]
  });
  const host = document.createElement('div');
  const app = createApp(SelectedDirectoryCard, { state });
  try {
    app.mount(host);
    expect([...host.querySelectorAll('[role=tab]')].map((tab) => tab.textContent?.trim())).toEqual([
      '总结',
      '校验',
      '配置',
      '视频',
      '封面',
      '字幕'
    ]);
    host.querySelector<HTMLButtonElement>('#bilipack-tab-video')!.click();
    await nextTick();
    const player = host.querySelector('video')!;
    expect(player.controls).toBe(true);
    expect(player.autoplay).toBe(false);
    expect(player.getAttribute('src')).toBe('blob:local-video');
    expect(createObjectURL).toHaveBeenCalledWith(video);
    state.results = [
      {
        id: 'video.upload',
        role: 'target' as const,
        status: 'skipped',
        message: '页面已有视频，跳过视频上传'
      }
    ];
    await nextTick();
    expect(
      host.querySelector('#bilipack-panel-video .video-upload-notice')?.textContent?.trim()
    ).toBe('未上传（页面已有视频）');
    expect(host.querySelector('video')).toBe(player);
    state.results = [
      { id: 'video.upload', role: 'target' as const, status: 'verified', message: '上传完成' }
    ];
    await nextTick();
    expect(host.querySelector('.video-upload-notice')).toBeNull();
    expect(host.querySelector('.video-title')).toBeNull();
    expect(host.querySelector('#bilipack-panel-video figcaption')).toBeNull();
    expect(host.querySelector('.video-heading')).toBeNull();
    expect(host.querySelector('.video-details')?.firstElementChild).toBe(player);
    const filename = host.querySelector<HTMLElement>('.video-metadata .metadata-filename')!;
    expect(filename.textContent).toBe('clip.mp4');
    Object.defineProperties(filename, {
      scrollWidth: { configurable: true, value: 200 },
      clientWidth: { configurable: true, value: 100 }
    });
    filename.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')?.textContent).toBe('clip.mp4');
    expect(filename.getAttribute('aria-describedby')).toBe(
      host.querySelector('[role=tooltip]')?.id
    );
    host
      .querySelector('.video-metadata .metadata-file')!
      .dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')).toBeNull();
    filename.dispatchEvent(new FocusEvent('focus'));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')).not.toBeNull();
    filename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')).toBeNull();
    Object.defineProperty(filename, 'clientWidth', { value: 300 });
    filename.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(host.querySelector('[role=tooltip]')).toBeNull();
    const metadata = () =>
      Object.fromEntries(
        [...host.querySelectorAll('.video-metadata dt')].map((label) => [
          label.textContent,
          label.nextElementSibling?.textContent
        ])
      );
    expect(metadata()).toMatchObject({
      文件大小: '5 B',
      文件格式: 'MP4',
      媒体类型: 'video/mp4',
      时长: '—'
    });
    Object.defineProperties(player, {
      duration: { configurable: true, value: 421 },
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 }
    });
    player.dispatchEvent(new Event('loadedmetadata'));
    await nextTick();
    expect(metadata()).toMatchObject({ 时长: '07:01', 分辨率: '1920 × 1080', 画面比例: '16:9' });
    Object.defineProperty(player, 'duration', { value: Infinity });
    player.dispatchEvent(new Event('durationchange'));
    player.dispatchEvent(new Event('error'));
    await nextTick();
    expect(metadata()['时长']).toBe('—');
    expect(host.querySelector('.video-details .hint')?.textContent).toContain('浏览器无法读取');
    expect(host.querySelector('#bilipack-panel-video img')).toBeNull();
    expect(host.querySelector('#bilipack-panel-cover img')?.getAttribute('src')).toBe('blob:cover');
    host.querySelector<HTMLButtonElement>('#bilipack-tab-subtitle')!.click();
    await nextTick();
    expect(host.querySelector('video')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-video');
    expect(
      host.querySelector('#bilipack-panel-subtitle pre.shiki.github-light code')?.textContent
    ).toBe(source);
    expect(host.querySelector('#bilipack-panel-subtitle img')).toBeNull();
    state.attachments = state.attachments.filter((file) => file.type !== 'subtitle');
    await nextTick();
    expect(host.querySelector('#bilipack-tab-subtitle')).toBeNull();
    expect(host.querySelector('#bilipack-tab-summary')?.getAttribute('aria-selected')).toBe('true');
    host.querySelector<HTMLButtonElement>('#bilipack-tab-video')!.click();
    await nextTick();
  } finally {
    app.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  }
});
