export function formatSize(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const index = Math.min(
    Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${units[index]}`;
}
export function aspectRatio(width: number, height: number) {
  let a = width,
    b = height;
  while (b) [a, b] = [b, a % b];
  return `${width / a}:${height / a}`;
}
