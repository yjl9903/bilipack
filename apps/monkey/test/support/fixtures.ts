import type { CoverImage } from '../../src/input/types';
export function file(path: string, content = 'test') {
  const f = new File([content], path.split('/').at(-1)!);
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  Object.defineProperty(f, 'text', { value: async () => content });
  return f;
}
export function cover(ratio: CoverImage['ratio'], name: string, url: string): CoverImage {
  const file = new File(['cover'], name);
  return {
    ratio,
    file,
    url,
    source: { mode: 'dual', file, width: ratio === '16:9' ? 1600 : 1200, height: 900 }
  };
}
