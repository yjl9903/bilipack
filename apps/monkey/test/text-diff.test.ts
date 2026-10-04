import { createApp, nextTick, reactive } from 'vue';
import { expect, it } from 'vitest';
import ResultRow from '../src/panel/components/ui/ResultRow.vue';

it.each([
  ['第38回アフタートーク', '第37回アフタートーク', '38', '37'],
  ['介绍\n\n出演：👩🏽‍💻\n链接 <script>', '介绍\n\n出演：👨🏽‍💻\n链接 <script>', '👩🏽‍💻', '👨🏽‍💻'],
  ['保留内容，删除这段', '保留内容', '，删除这段', ''],
  ['', '新增内容\n\n第二段', '', '新增内容\n\n第二段']
])(
  'highlights changes on their own side and preserves both texts: %s',
  async (actual, expected, removed, added) => {
    const result = reactive({
      id: 'info.title',
      role: 'target' as const,
      status: 'different' as const,
      message: '有差异',
      actual,
      expected
    });
    const host = document.createElement('div');
    const app = createApp(ResultRow, { result, comparison: true });
    try {
      app.mount(host);
      const current = host.querySelector('.current .comparison-text')!;
      const target = host.querySelector('.target .comparison-text')!;
      expect(current.textContent).toBe(actual || '（空）');
      expect(target.textContent).toBe(expected || '（空）');
      expect([...current.querySelectorAll('del')].map((el) => el.textContent).join('')).toBe(
        removed
      );
      expect([...target.querySelectorAll('ins')].map((el) => el.textContent).join('')).toBe(added);
      expect(current.querySelector('ins')).toBeNull();
      expect(target.querySelector('del')).toBeNull();
      expect(host.querySelector('script')).toBeNull();
      result.actual = expected;
      await nextTick();
      expect(host.querySelector('.result-comparison')).toBeNull();
    } finally {
      app.unmount();
    }
  }
);
