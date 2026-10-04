import { normalizePath, ValidationError, type Diagnostic } from 'bilipack';
export function indexFiles(files: readonly File[]): Map<string, File> {
  const index = new Map<string, File>(),
    errors: Diagnostic[] = [];
  let root: string | undefined;
  for (const file of files) {
    const relative = file.webkitRelativePath;
    const split = relative.indexOf('/');
    if (split <= 0) {
      errors.push({ field: file.name, code: 'root', message: '请选择完整目录' });
      continue;
    }
    const folder = relative.slice(0, split);
    root ??= folder;
    if (folder !== root) {
      errors.push({ field: relative, code: 'root', message: '文件不属于同一个根目录' });
      continue;
    }
    try {
      const path = normalizePath(relative.slice(split + 1));
      if (index.has(path)) throw new Error('规范化后的路径重复');
      index.set(path, file);
    } catch (error) {
      errors.push({ field: relative, code: 'path', message: (error as Error).message });
    }
  }
  if (!index.has('bilipack.toml'))
    errors.push({
      field: 'bilipack.toml',
      code: 'missing',
      message: '所选根目录必须包含 bilipack.toml'
    });
  if (errors.length) throw new ValidationError(errors);
  return index;
}
export function requireFile(index: ReadonlyMap<string, File>, path: string, field: string): File {
  const file = index.get(path);
  if (!file || file.size === 0)
    throw new ValidationError([{ field, code: 'file', message: `${path} 不存在或为空` }]);
  return file;
}
