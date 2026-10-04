import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import SelectedDirectoryCard from '../src/panel/SelectedDirectoryCard.vue';
import type { ViewState } from '../src/application/types';

class PreviewCue {
  constructor(
    public startTime: number,
    public endTime: number,
    public text: string
  ) {}
}
class PreviewTrack {
  mode: TextTrackMode = 'disabled';
  items: PreviewCue[] = [];
  get cues() {
    return this.mode === 'disabled' ? null : this.items;
  }
  addCue(cue: PreviewCue) {
    this.items.push(cue);
  }
  removeCue(cue: PreviewCue) {
    this.items.splice(this.items.indexOf(cue), 1);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('links the subtitle selector with native video captions, defaults to the first and clears obsolete cues', async () => {
  vi.stubGlobal('VTTCue', PreviewCue);
  const createObjectURL = vi.fn(() => 'blob:preview');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  const tracks = new Map<HTMLMediaElement, PreviewTrack>();
  const addTextTrack = vi
    .spyOn(HTMLMediaElement.prototype, 'addTextTrack')
    .mockImplementation(function (this: HTMLMediaElement) {
      const track = new PreviewTrack();
      tracks.set(this, track);
      return track as unknown as TextTrack;
    });
  const chinese = '1\r\n00:00:01,125 --> 00:00:03,500\r\n你好\r\n第二行\r\n';
  const english = '1\n00:00:02,000 --> 00:00:04,000\nHello\n';
  const state = reactive<ViewState>({
    directoryName: 'p',
    visible: true,
    busy: false,
    raw: '',
    summary: '',
    results: [],
    attachments: [
      { type: 'video', file: new File(['v'], 'v.mp4'), name: 'v.mp4', size: 1, kind: '视频' },
      {
        type: 'subtitle',
        language: '中文',
        source: chinese,
        name: 'zh.srt',
        size: 1,
        kind: '字幕'
      },
      { type: 'subtitle', language: '英语', source: english, name: 'en.srt', size: 1, kind: '字幕' }
    ]
  });
  const host = document.createElement('div');
  const app = createApp(SelectedDirectoryCard, { state });
  try {
    app.mount(host);
    host.querySelector<HTMLButtonElement>('#bilipack-tab-video')!.click();
    await nextTick();
    let video = host.querySelector('video')!;
    expect(tracks.get(video)?.mode).toBe('showing');
    expect(tracks.get(video)?.items).toEqual([new PreviewCue(1.125, 3.5, '你好\n第二行')]);
    expect(
      host.querySelector('#bilipack-panel-subtitle [role=combobox]')?.textContent?.trim()
    ).toBe('中文');

    host.querySelector<HTMLButtonElement>('#bilipack-tab-subtitle')!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('#bilipack-panel-subtitle [role=combobox]')!.click();
    await nextTick();
    host.querySelectorAll<HTMLElement>('#bilipack-panel-subtitle [role=option]')[1].click();
    await nextTick();
    expect(host.querySelector('#bilipack-panel-subtitle code')?.textContent).toBe(english);
    host.querySelector<HTMLButtonElement>('#bilipack-tab-video')!.click();
    await nextTick();
    video = host.querySelector('video')!;
    const track = tracks.get(video)!;
    expect(track.items).toEqual([new PreviewCue(2, 4, 'Hello')]);
    expect(track.mode).toBe('showing');
    video.currentTime = 12;
    state.attachments = state.attachments.filter(
      (file) => file.type !== 'subtitle' || file.language !== '英语'
    );
    await nextTick();
    expect(host.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(12);
    expect(track.items).toEqual([new PreviewCue(1.125, 3.5, '你好\n第二行')]);
    expect(track.mode).toBe('showing');
    expect(addTextTrack).toHaveBeenCalledTimes(2);
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    state.attachments.find((file) => file.type === 'subtitle')!.source = 'invalid';
    await nextTick();
    expect(track.mode).toBe('disabled');
    expect(track.items).toHaveLength(0);
    expect(host.querySelector('.video-details .empty-state')?.textContent).toContain(
      '字幕预览暂不可用'
    );
    state.attachments = state.attachments.filter((file) => file.type !== 'subtitle');
    await nextTick();
    expect(track.mode).toBe('disabled');
    expect(host.querySelector('.video-details .empty-state')).toBeNull();
    expect(host.querySelector('video')).toBe(video);
  } finally {
    app.unmount();
  }
  expect(revokeObjectURL).toHaveBeenCalledTimes(2);
});
