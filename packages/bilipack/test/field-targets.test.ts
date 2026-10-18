import { it, expect } from 'vitest';
import { fieldTargets } from '../src';
it('writes tags after all fields which can rerender or recommend tags', () => {
  const targets = fieldTargets({
    info: { tags: ['目标'], category: '动画', title: '标题', description: '简介' },
    display: { watermark: false },
    interaction: { dynamic: '动态' }
  });
  expect(targets[0].field).toBe('info.category');
  expect(targets.at(-1)?.field).toBe('info.tags');
});
