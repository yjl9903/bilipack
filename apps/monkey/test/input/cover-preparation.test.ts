import { expect, it, vi } from 'vitest';
import { prepare } from '../../src/input/prepare';
import { releaseCovers } from '../../src/input/cover';
import { file } from '../support/fixtures';

function image(width: number, height: number) {
  return { width, height, close: vi.fn() };
}

function browserImages(...images: ReturnType<typeof image>[]) {
  const decode = vi.fn<typeof createImageBitmap>();
  for (const bitmap of images) decode.mockResolvedValueOnce(bitmap as unknown as ImageBitmap);
  vi.stubGlobal('createImageBitmap', decode);
  const drawImage = vi.fn();
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage
  } as unknown as CanvasRenderingContext2D);
  const blob = new Blob(['encoded PNG'], { type: 'image/png' });
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback) => callback(blob));
  let nextUrl = 0;
  const createObjectURL = vi.fn((_blob: Blob) => `blob:cover-${++nextUrl}`);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  return { decode, drawImage, getContext, encode, blob, createObjectURL, revokeObjectURL };
}

const single = '[cover]\nfile="original.jpg"\nwide_position=[25,75]\nstandard_position=[65,25]';
const dual = '[cover]\nmode="dual"\nwide_file="wide.jpg"\nstandard_file="standard.png"';

it.each([
  { width: 1600, height: 1400, wide: [0, 375, 1600, 900], standard: [0, 50, 1600, 1200] },
  { width: 1800, height: 900, wide: [50, 0, 1600, 900], standard: [390, 0, 1200, 900] }
])(
  'prepares both single-image crops from $width × $height with their own positions',
  async ({ width, height, wide, standard }) => {
    const bitmaps = [image(width, height), image(width, height)];
    const browser = browserImages(...bitmaps);
    const source = file('pack/original.jpg');
    const prepared = await prepare(single, new Map([['original.jpg', source]]), {
      requireVideo: false
    });
    try {
      expect(prepared.covers.map((cover) => [cover.ratio, cover.file.name, cover.url])).toEqual([
        ['16:9', 'bilipack-wide.png', 'blob:cover-1'],
        ['4:3', 'bilipack-standard.png', 'blob:cover-2']
      ]);
      for (const [index, rect] of [wide, standard].entries()) {
        expect(browser.decode).toHaveBeenNthCalledWith(index + 1, source, {
          imageOrientation: 'from-image'
        });
        expect(browser.drawImage).toHaveBeenNthCalledWith(
          index + 1,
          bitmaps[index],
          ...rect,
          0,
          0,
          rect[2],
          rect[3]
        );
        const canvas = browser.encode.mock.contexts[index];
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected canvas context');
        expect([canvas.width, canvas.height]).toEqual(rect.slice(2));
        const cover = prepared.covers[index];
        expect(cover.source.file).toBe(source);
        expect(cover.file).not.toBe(source);
        expect(cover.file.type).toBe('image/png');
        expect(cover.file.size).toBe(browser.blob.size);
        expect(cover.source).toEqual({
          mode: 'single',
          file: source,
          width,
          height,
          position: index === 0 ? [25, 75] : [65, 25]
        });
        expect(browser.createObjectURL).toHaveBeenNthCalledWith(index + 1, cover.file);
        expect(bitmaps[index].close).toHaveBeenCalledOnce();
      }
      expect(browser.encode).toHaveBeenCalledTimes(2);
      expect(browser.encode.mock.calls.every(([, type]) => type === 'image/png')).toBe(true);
      expect(browser.revokeObjectURL).not.toHaveBeenCalled();
    } finally {
      releaseCovers(prepared.covers);
    }
    expect(browser.revokeObjectURL.mock.calls).toEqual([['blob:cover-1'], ['blob:cover-2']]);
  }
);

it('preserves the separate source files for dual covers without cropping or re-encoding', async () => {
  const bitmaps = [image(1600, 900), image(1200, 900)];
  const browser = browserImages(...bitmaps);
  const wide = file('pack/wide.jpg');
  const standard = file('pack/standard.png');
  const prepared = await prepare(
    dual,
    new Map([
      ['wide.jpg', wide],
      ['standard.png', standard]
    ]),
    {
      requireVideo: false
    }
  );
  try {
    expect(prepared.covers).toEqual([
      {
        ratio: '16:9',
        file: wide,
        url: 'blob:cover-1',
        source: { mode: 'dual', file: wide, width: 1600, height: 900 }
      },
      {
        ratio: '4:3',
        file: standard,
        url: 'blob:cover-2',
        source: { mode: 'dual', file: standard, width: 1200, height: 900 }
      }
    ]);
    for (const [index, source] of [wide, standard].entries()) {
      expect(prepared.covers[index].file).toBe(source);
      expect(prepared.covers[index].source.file).toBe(source);
      expect(browser.decode.mock.calls[index][0]).toBe(source);
      expect(browser.createObjectURL.mock.calls[index][0]).toBe(source);
    }
    expect(browser.getContext).not.toHaveBeenCalled();
    expect(browser.encode).not.toHaveBeenCalled();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  } finally {
    releaseCovers(prepared.covers);
  }
  expect(browser.revokeObjectURL.mock.calls).toEqual([['blob:cover-1'], ['blob:cover-2']]);
});

it.each(['decode', 'canvas', 'encode'] as const)(
  'releases the first preview and decoded images when the second crop fails at %s',
  async (failure) => {
    const bitmaps = [image(1600, 1400), image(1600, 1400)];
    const browser = browserImages(...bitmaps);
    if (failure === 'decode') {
      browser.decode
        .mockReset()
        .mockResolvedValueOnce(bitmaps[0] as unknown as ImageBitmap)
        .mockRejectedValueOnce(new Error('图片解码失败'));
    } else if (failure === 'canvas') {
      browser.getContext
        .mockReturnValueOnce({
          drawImage: browser.drawImage
        } as unknown as CanvasRenderingContext2D)
        .mockReturnValueOnce(null);
    } else {
      browser.encode
        .mockImplementationOnce((callback) => callback(browser.blob))
        .mockImplementationOnce((callback) => callback(null));
    }
    await expect(
      prepare(single, new Map([['original.jpg', file('pack/original.jpg')]]), {
        requireVideo: false
      })
    ).rejects.toMatchObject({
      diagnostics: [
        {
          field: 'cover',
          code: 'preflight',
          message:
            failure === 'decode'
              ? '图片解码失败'
              : failure === 'canvas'
                ? '浏览器无法生成封面'
                : '封面编码失败'
        }
      ]
    });
    expect(browser.createObjectURL).toHaveBeenCalledOnce();
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:cover-1');
    expect(bitmaps[0].close).toHaveBeenCalledOnce();
    expect(bitmaps[1].close).toHaveBeenCalledTimes(failure === 'decode' ? 0 : 1);
  }
);

it('rejects a mismatched second dual cover and releases the first preview', async () => {
  const bitmaps = [image(1600, 900), image(1600, 900)];
  const browser = browserImages(...bitmaps);
  await expect(
    prepare(
      dual,
      new Map([
        ['wide.jpg', file('pack/wide.jpg')],
        ['standard.png', file('pack/standard.png')]
      ]),
      { requireVideo: false }
    )
  ).rejects.toMatchObject({
    diagnostics: [
      expect.objectContaining({ field: 'cover', message: expect.stringContaining('4:3') })
    ]
  });
  expect(browser.encode).not.toHaveBeenCalled();
  expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:cover-1');
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
});

it('releases both prepared covers when another attachment fails validation', async () => {
  const bitmaps = [image(1600, 1400), image(1600, 1400)];
  const browser = browserImages(...bitmaps);
  await expect(
    prepare(
      `${single}\n[[subtitles]]\nfile="missing.srt"\nlanguage="中文"`,
      new Map([['original.jpg', file('pack/original.jpg')]]),
      { requireVideo: false }
    )
  ).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ field: 'subtitles[0].file', code: 'file' })]
  });
  expect(browser.createObjectURL).toHaveBeenCalledTimes(2);
  expect(browser.revokeObjectURL.mock.calls).toEqual([['blob:cover-1'], ['blob:cover-2']]);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
});
