import { expect, it } from 'vitest';
import { readUploadDrop } from '../src/input/drop';

function fileEntry(name: string): FileSystemEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (resolve: (file: File) => void) => resolve(new File(['content'], name))
  } as unknown as FileSystemEntry;
}
function directory(name: string, batches: FileSystemEntry[][]): FileSystemDirectoryEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) =>
          resolve(batches[index++] ?? [])
      };
    }
  } as FileSystemDirectoryEntry;
}
function transfer(...entries: FileSystemEntry[]): DataTransfer {
  return {
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files: []
  } as unknown as DataTransfer;
}

it('reads every directory batch and nested file with paths compatible with the directory picker', async () => {
  const root = directory('包', [
    [fileEntry('bilipack.toml')],
    [directory('media', [[fileEntry('video.mp4')]])]
  ]);
  const drop = readUploadDrop(transfer(root));
  if (drop.kind !== 'directory') throw new Error('expected directory');
  const files = await drop.read(new AbortController().signal);
  expect(files.map((file) => file.webkitRelativePath)).toEqual([
    '包/bilipack.toml',
    '包/media/video.mp4'
  ]);
});

it('rejects mixed drops and multiple directories before starting either upload path', () => {
  const root = directory('包', []);
  expect(() => readUploadDrop(transfer(root, fileEntry('video.mp4')))).toThrow('不要混入');
  expect(() => readUploadDrop(transfer(root, directory('另一个包', [])))).toThrow('单独拖入');
});

it('does not continue reading an aborted import and reports empty directories', async () => {
  const drop = readUploadDrop(transfer(directory('空目录', [])));
  if (drop.kind !== 'directory') throw new Error('expected directory');
  const controller = new AbortController();
  controller.abort();
  await expect(drop.read(controller.signal)).rejects.toThrow();
  await expect(drop.read(new AbortController().signal)).rejects.toThrow('目录为空');
});
