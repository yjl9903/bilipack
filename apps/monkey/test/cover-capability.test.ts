import { expect, it, vi } from 'vitest';
import { parseConfig } from 'bilipack';
import { createBilibiliAdapter } from '../src/bilibili/adapter';
import { compare } from '../src/workflow/compare';
import { plan } from '../src/workflow/plan';
import { run } from '../src/workflow/run';
import { context, mockAdapter, cover } from './helpers';

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

it('skips unavailable cover controls while writing supported fields', async () => {
  const capability = vi.fn((field: string, value?: unknown) =>
    field === 'cover' ? { available: false, reason: '封面控件不可用' } : { available: true }
  );
  const adapter = mockAdapter({ capability, applyCovers: vi.fn(async () => {}) });
  const config = parseConfig('[info]\ntitle="新标题"\n[cover]\nfile="c.jpg"\nwide_position=[0,50]');
  const c = context(
    {
      config,
      covers: [cover('16:9', 'w.png', 'blob:w'), cover('4:3', 's.png', 'blob:s')]
    },
    adapter
  );
  const results = await run(plan(c.prepared, c.page), c);
  expect(
    results.filter((r) => r.id.startsWith('cover.')).every((r) => r.status === 'skipped')
  ).toBe(true);
  expect(capability).toHaveBeenCalledWith('cover', config.cover);
  expect(adapter.applyField).toHaveBeenCalledOnce();
  expect(adapter.applyCovers).not.toHaveBeenCalled();
});

it.each([
  '[cover]\nfile="cover.jpg"',
  '[cover]\nfile="cover.jpg"\nwide_position=[25,75]\nstandard_position=[65,25]',
  '[cover]\nmode="dual"\nwide_file="w.jpg"\nstandard_file="s.png"'
])('passes cover preparation strategy through comparison and batched writing: %s', async (raw) => {
  const capability = vi.fn((field: string, value?: unknown) =>
    field === 'cover' ? coverCapability(value) : { available: true }
  );
  const adapter = mockAdapter({ capability, applyCovers: vi.fn(async () => {}) });
  const config = parseConfig(raw);
  const c = context(
    {
      config,
      covers: [cover('16:9', 'w.png', 'blob:w'), cover('4:3', 's.png', 'blob:s')]
    },
    adapter
  );
  const results = await compare(c, vi.fn());
  expect(capability).toHaveBeenCalledWith('cover', config.cover);
  expect(results.map((r) => r.status)).toEqual(['skipped', 'unverified', 'unverified']);
  expect(results.some((r) => r.status === 'blocked')).toBe(false);
  const written = await run(plan(c.prepared, c.page), c);
  expect(adapter.applyCovers).toHaveBeenCalledExactlyOnceWith(c.prepared.covers, c.signal, c.page);
  expect(written.filter((r) => r.id.startsWith('cover.')).map((r) => r.status)).toEqual([
    'verified',
    'verified'
  ]);
});
