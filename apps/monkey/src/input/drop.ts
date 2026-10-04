export type UploadDrop =
  | { kind: 'directory'; read: (signal: AbortSignal) => Promise<File[]> }
  | { kind: 'video'; files: File[] };

/** Snapshot entries during the drop event, before the browser protects its data store. */
export function readUploadDrop(transfer: DataTransfer): UploadDrop {
  const items = Array.from(transfer.items).filter((item) => item.kind === 'file');
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  const directories = entries.filter((entry) => entry?.isDirectory);
  if (directories.length) {
    if (directories.length !== 1 || items.length !== 1)
      throw new Error('请单独拖入一个 Bilipack 目录，不要混入视频文件或其他目录');
    const root = directories[0] as FileSystemDirectoryEntry;
    return { kind: 'directory', read: (signal) => readDirectory(root, signal) };
  }
  const files = Array.from(transfer.files);
  if (!files.length) throw new Error('请拖入 Bilipack 目录或视频文件');
  return { kind: 'video', files };
}

async function readDirectory(root: FileSystemDirectoryEntry, signal: AbortSignal): Promise<File[]> {
  const files: File[] = [];
  async function visit(entry: FileSystemEntry, path: string): Promise<void> {
    signal.throwIfAborted();
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      );
      signal.throwIfAborted();
      Object.defineProperty(file, 'webkitRelativePath', { value: path });
      files.push(file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      signal.throwIfAborted();
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      );
      signal.throwIfAborted();
      if (!batch.length) break;
      for (const child of batch) await visit(child, `${path}/${child.name}`);
    }
  }
  await visit(root, root.name);
  if (!files.length) throw new Error('拖入的目录为空');
  return files;
}
