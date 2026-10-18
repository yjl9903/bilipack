import { expect, it } from 'vitest';
import { progressLabel } from '../../src/panel/labels';

it.each([
  ['execute', '正在执行：good'],
  ['verify', '正在核验：good']
] as const)('labels %s progress', (phase, label) => {
  expect(progressLabel({ phase, id: 'good' })).toBe(label);
});

it('identifies the final video observation for the user', () => {
  expect(progressLabel({ phase: 'observe', id: 'video.ready' })).toContain('确认视频上传完成');
});
