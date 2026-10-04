import { expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import CoverPreviews from '../src/panel/components/cover/CoverPreviews.vue';
import type { CoverAttachment } from '../src/application/types';

it.each(['single', 'dual'] as const)(
  'shows source metadata in the correct place for %s covers',
  async (mode) => {
    const original = new File(['original'], '原始封面.jpg', {
      type: 'image/jpeg',
      lastModified: 0
    });
    const standard = new File(['standard'], '首页封面.png', { type: 'image/png', lastModified: 0 });
    const files: CoverAttachment[] = [
      {
        type: 'cover',
        name: 'bilipack-wide.png',
        size: 100,
        kind: '旧说明',
        url: 'blob:wide',
        cover: {
          ratio: '16:9',
          source: {
            file: original,
            width: 1600,
            height: 900,
            ...(mode === 'single'
              ? { mode: 'single', position: [25, 75] as [number, number] }
              : { mode: 'dual' })
          }
        }
      },
      {
        type: 'cover',
        name: 'bilipack-standard.png',
        size: 200,
        kind: '旧说明',
        url: 'blob:standard',
        cover: {
          ratio: '4:3',
          source: {
            file: mode === 'single' ? original : standard,
            width: mode === 'single' ? 1600 : 1200,
            height: 900,
            ...(mode === 'single'
              ? { mode: 'single', position: [65, 25] as [number, number] }
              : { mode: 'dual' })
          }
        }
      }
    ];
    const host = document.createElement('div');
    const app = createApp(CoverPreviews, { files });
    try {
      app.mount(host);
      expect([...host.querySelectorAll('h2')].map((item) => item.textContent)).toEqual([
        '首页推荐封面（4:3）',
        '个人空间封面（16:9）'
      ]);
      expect([...host.querySelectorAll('img')].map((item) => item.getAttribute('src'))).toEqual([
        'blob:standard',
        'blob:wide'
      ]);
      expect(host.querySelector('figcaption')).toBeNull();
      expect(host.textContent).not.toContain('旧说明');
      expect(host.textContent).not.toContain('bilipack-');
      const panels = [...host.querySelectorAll('.media-metadata')];
      expect(panels).toHaveLength(mode === 'single' ? 1 : 2);
      const filename = panels[0].querySelector<HTMLElement>('.metadata-filename')!;
      expect(filename).not.toBeNull();
      Object.defineProperties(filename, {
        scrollWidth: { value: 200 },
        clientWidth: { value: 80 }
      });
      filename.dispatchEvent(new MouseEvent('mouseenter'));
      await nextTick();
      expect(panels[0].querySelector('[role=tooltip]')?.textContent).toBe(filename.textContent);
      filename.dispatchEvent(new FocusEvent('blur'));
      await nextTick();
      expect(panels[0].querySelector('[role=tooltip]')).toBeNull();
      if (mode === 'single') {
        expect(host.querySelector('figure .media-metadata')).toBeNull();
        expect(host.querySelector('.cover-previews')!.lastElementChild).toBe(panels[0]);
        expect(panels[0].textContent).toContain('原始封面.jpg');
        expect(panels[0].textContent).toContain('1600 × 900');
        expect(panels[0].textContent).toContain('8 B');
        expect(
          [...panels[0].querySelectorAll('dt')].slice(-3).map((item) => item.textContent)
        ).toEqual(['4:3 偏移', '16:9 偏移', '修改时间']);
        expect(panels[0].textContent).toContain('水平 65% · 垂直 25%');
        expect(panels[0].textContent).toContain('水平 25% · 垂直 75%');
      } else {
        expect(host.querySelectorAll('figure > .media-metadata')).toHaveLength(2);
        expect(panels[0].textContent).toContain('首页封面.png');
        expect(panels[0].textContent).toContain('1200 × 900');
        expect(panels[1].textContent).toContain('原始封面.jpg');
        for (const panel of panels) {
          expect(panel.textContent).toContain('偏移无偏移（不裁剪）');
          expect(panel.textContent).not.toContain('%');
        }
      }
    } finally {
      app.unmount();
    }
  }
);
