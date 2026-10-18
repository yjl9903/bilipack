import { it, expect } from 'vitest';
import { cropRect } from '../../src/input/cover';
it('maps position to the movable range of each ratio', () => {
  expect(cropRect(1600, 900, 4 / 3, [0, 0])).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
  expect(cropRect(1600, 900, 4 / 3, [50, 50]).x).toBe(200);
  expect(cropRect(1600, 900, 4 / 3, [100, 100]).x).toBe(400);
  expect(cropRect(900, 1600, 16 / 9, [50, 100]).y).toBe(1093.75);
});
