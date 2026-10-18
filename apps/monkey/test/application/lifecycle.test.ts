import { beforeEach, expect, it, vi } from 'vitest';
import { createTestController } from '../support/controller';
import type { Prepared } from '../../src/input/types';
import { context } from '../support/run-context';
import { file, cover } from '../support/fixtures';
import { fakeAdapter } from '../support/page-adapter';
const preparation = vi.hoisted(() => ({ prepare: vi.fn(), release: vi.fn() }));

vi.mock('../../src/input/prepare', () => ({ prepare: preparation.prepare }));

vi.mock('../../src/input/cover', () => ({ releaseCovers: preparation.release }));

beforeEach(() => vi.resetAllMocks());

it('releases late preparation after disposal and cannot publish into a replacement instance', async () => {
  let finish!: (value: Prepared) => void;
  preparation.prepare.mockReturnValueOnce(
    new Promise<Prepared>((resolve) => {
      finish = resolve;
    })
  );
  const oldAdapter = fakeAdapter();
  const old = createTestController(oldAdapter);
  const updates = vi.fn();
  old.subscribe(updates);
  const job = old.importDirectory(async () => [file('pack/bilipack.toml', '[info]\ntitle="旧"')]);
  await vi.waitFor(() => expect(preparation.prepare).toHaveBeenCalledOnce());
  old.dispose();
  const updateCount = updates.mock.calls.length;
  const nextAdapter = fakeAdapter();
  const next = createTestController(nextAdapter);
  preparation.prepare.mockResolvedValueOnce(
    context({ config: { info: { title: '新' } } }).prepared
  );
  const nextUpdates = vi.fn();
  next.subscribe(nextUpdates);
  await next.importDirectory(async () => [file('pack/bilipack.toml', '[info]\ntitle="新"')]);
  const nextState = nextUpdates.mock.calls.at(-1)![0];
  const covers = [cover('16:9', 'image.png', 'blob:late')];
  finish(context({ covers }).prepared);
  await job;
  expect(preparation.release).toHaveBeenCalledExactlyOnceWith(covers);
  expect(updates).toHaveBeenCalledTimes(updateCount);
  expect(nextUpdates.mock.calls.at(-1)![0]).toBe(nextState);
  expect(oldAdapter.applyField).not.toHaveBeenCalled();
  expect(nextState.results).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'info.title', expected: '新' })])
  );
  next.dispose();
});
