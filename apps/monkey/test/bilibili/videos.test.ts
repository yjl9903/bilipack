import { expect, it } from 'vitest';
import { sameVideoRows, videoState, type VideoRow } from '../../src/bilibili/videos';
import { matchesContext, type PageContext } from '../../src/workflow/port';

it('binds ordered identities, rejecting replacement even with identical names', () => {
  const rows: VideoRow[] = [
    { node: document.createElement('div'), title: 'same', state: 'ready' },
    { node: document.createElement('div'), title: 'same', state: 'ready' }
  ];
  expect(
    sameVideoRows(
      rows,
      rows.map((row) => ({ ...row }))
    )
  ).toBe(true);
  expect(sameVideoRows(rows, [...rows].reverse())).toBe(false);
  expect(sameVideoRows(rows, [rows[0]])).toBe(false);
  expect(sameVideoRows(rows, [rows[0], { ...rows[1], node: document.createElement('div') }])).toBe(
    false
  );
  expect(sameVideoRows(rows, [rows[0], { ...rows[1], state: 'uploading' }])).toBe(false);
  expect(sameVideoRows(rows, [rows[0], { ...rows[1], title: 'changed' }])).toBe(false);
  expect(sameVideoRows([{ ...rows[0], state: 'uploading' }], [rows[0]])).toBe(true);
});

it('allows only the declared upload growth and locks an existing count', () => {
  const page: PageContext = {
    identity: 'draft',
    generation: 1,
    target: true,
    editor: false,
    count: 0,
    video: 'absent',
    uploadCount: 2
  };
  expect(matchesContext(page, { ...page, count: 1 })).toBe(true);
  expect(matchesContext(page, { ...page, count: 2 })).toBe(true);
  expect(matchesContext(page, { ...page, count: 3 })).toBe(false);
  expect(matchesContext({ ...page, count: 2 }, { ...page, count: 1 })).toBe(false);
  expect(matchesContext({ ...page, count: 2 }, { ...page, count: 2, generation: 2 })).toBe(false);
});

it('keeps upload progress distinct from explicit completion', () => {
  expect(videoState('已经上传：1MB/1MB 当前速度：1MB/s 100%')).toBe('uploading');
  expect(videoState('上传完成')).toBe('ready');
  expect(videoState('上传失败')).toBe('failed');
  expect(videoState('100%')).toBe('unknown');
});
