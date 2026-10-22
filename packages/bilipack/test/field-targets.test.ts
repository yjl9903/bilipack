import { it, expect } from 'vitest';

import { fieldTargets } from '../src';

it('orders declaration before source, topic and watermark while preserving explicit values', () => {
  const targets = fieldTargets({
    info: { source: 'https://example.com/video', topic: '', declaration: '内容为转载' },
    display: { watermark: false }
  });
  expect(targets[0]).toEqual({ field: 'info.declaration', value: '内容为转载' });
  expect(targets).toContainEqual({ field: 'info.source', value: 'https://example.com/video' });
  expect(targets).toContainEqual({ field: 'display.watermark', value: false });
  expect(targets).toContainEqual({ field: 'info.topic', value: '' });
});

it('writes tags after all fields which can rerender or recommend tags', () => {
  const targets = fieldTargets({
    info: { tags: ['目标'], category: '动画', title: '标题', description: '简介' },
    display: { watermark: false },
    interaction: { dynamic: '动态' }
  });
  expect(targets[0].field).toBe('info.category');
  expect(targets.at(-1)?.field).toBe('info.tags');
});
