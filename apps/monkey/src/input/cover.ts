import type { CoverImage } from './types';
import type { Config, Position } from 'bilipack';
import { requireFile } from './files';
export function cropRect(
  width: number,
  height: number,
  ratio: number,
  [horizontal, vertical]: Position
) {
  if (![width, height, ratio].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('无效图片尺寸');
  const w = Math.min(width, height * ratio),
    h = w / ratio;
  return {
    x: ((width - w) * horizontal) / 100,
    y: ((height - h) * vertical) / 100,
    width: w,
    height: h
  };
}
export async function prepareCovers(
  config: NonNullable<Config['cover']>,
  files: ReadonlyMap<string, File>
): Promise<CoverImage[]> {
  const result: CoverImage[] = [];
  try {
    for (const [ratio, r, slot] of [
      ['16:9', 16 / 9, 'wide'],
      ['4:3', 4 / 3, 'standard']
    ] as const) {
      const path = config.mode === 'single' ? config.file : config[`${slot}_file`];
      const source = requireFile(files, path, `cover.${slot}`);
      if (!/\.(jpe?g|png)$/i.test(path)) throw new Error(`${path}: 封面仅支持 JPEG / PNG`);
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
      try {
        let file = source;
        if (config.mode === 'dual') {
          if (Math.abs(bitmap.width - bitmap.height * r) > 1)
            throw new Error(
              `${path}: Bilipack 双图输入须符合 ${ratio}（工具约定，非平台限制），不会自动裁剪`
            );
        } else {
          const rect = cropRect(bitmap.width, bitmap.height, r, config[`${slot}_position`]);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
          if (!canvas.width || !canvas.height) throw new Error('图片尺寸过小');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('浏览器无法生成封面');
          context.drawImage(
            bitmap,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            canvas.width,
            canvas.height
          );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('封面编码失败'))), 'image/png')
          );
          file = new File([blob], `bilipack-${slot}.png`, { type: 'image/png' });
        }
        result.push({
          ratio,
          file,
          url: URL.createObjectURL(file),
          source: {
            file: source,
            width: bitmap.width,
            height: bitmap.height,
            ...(config.mode === 'single'
              ? { mode: 'single', position: config[`${slot}_position`] }
              : { mode: 'dual' })
          }
        });
      } finally {
        bitmap.close();
      }
    }
    return result;
  } catch (error) {
    releaseCovers(result);
    throw error;
  }
}
export function releaseCovers(covers: readonly CoverImage[]) {
  covers.forEach((c) => URL.revokeObjectURL(c.url));
}
