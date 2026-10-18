import { coverPan } from '../../src/bilibili/cover';
import { expect, it } from 'vitest';
import { parseConfig } from 'bilipack';
import { createBilibiliAdapter } from '../../src/bilibili/adapter';
import { cover } from '../support/fixtures';
const coverCapability = (value: unknown) =>
  createBilibiliAdapter(document).capability('cover', value);

it('accepts center, noncenter and independent dual-file cover strategies', () => {
  expect(coverCapability(parseConfig('[cover]\nfile="cover.jpg"').cover).available).toBe(true);
  expect(
    coverCapability(parseConfig('[cover]\nfile="cover.jpg"\nstandard_position=[65,50]').cover)
  ).toMatchObject({ available: true });
  expect(
    coverCapability(
      parseConfig('[cover]\nfile="cover.jpg"\nwide_position=[0,100]\nstandard_position=[100,0]')
        .cover
    )
  ).toMatchObject({ available: true });
  expect(
    coverCapability(
      parseConfig('[cover]\nmode="dual"\nwide_file="w.jpg"\nstandard_file="s.jpg"').cover
    )
  ).toMatchObject({ available: true });
});
it('maps crop travel to native minimum-fit drag without moving an uncropped axis', () => {
  const wide = coverPan(1600, 1000, 420, 236.25, [25, 75]);
  expect(wide.x).toBe(0);
  expect(wide.y).toBeCloseTo(-6.5625);
  const standard = coverPan(1600, 1000, 315, 236.25, [65, 25]);
  expect(standard.x).toBeCloseTo(-9.45);
  expect(standard.y).toBe(0);
  expect(coverPan(1280, 720, 315, 236.25, [50, 50])).toEqual({ x: 0, y: 0 });
  expect(coverPan(1280, 720, 315, 236.25, [100, 100]).x).toBeCloseTo(-52.5);
  expect(coverPan(900, 1600, 420, 236.25, [25, 75]).y).toBeCloseTo(-127.6041667);
  expect(coverPan(900, 1600, 315, 236.25, [65, 25]).y).toBeCloseTo(80.9375);
  expect(() => coverPan(900, 1600, 0, 0, [50, 50])).toThrow('无效');
});
