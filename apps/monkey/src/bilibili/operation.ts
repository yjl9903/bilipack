import { matchesContext, type PageContext } from '../workflow/port';
import {
  waitFor as poll,
  click as nativeClick,
  writeText as nativeText,
  assignFile as nativeFile
} from './controls';

/** One operation owns its binding; no shared mutable adapter-wide active context. */
export interface Operation {
  signal: AbortSignal;
  check(): void;
  checkWrite(): void;
  write<T>(action: () => T): T;
}
export function createOperation(
  readContext: () => PageContext,
  expected: PageContext,
  signal: AbortSignal,
  allowSubmission = false
): Operation {
  const bound = { ...expected };
  const assert = (writing: boolean) => {
    signal.throwIfAborted();
    const actual = readContext();
    if (!matchesContext(bound, actual)) throw new Error('页面或稿件已变化；停止后续操作，保留现场');
    if ((writing || !allowSubmission) && actual.submissionWaiting)
      throw new Error('已进入投稿等待，停止表单操作');
  };
  return {
    signal,
    check: () => assert(false),
    checkWrite: () => assert(true),
    write(action) {
      assert(true);
      const value = action();
      assert(true);
      return value;
    }
  };
}
export async function waitFor<T>(
  read: () => T | undefined,
  operation: Operation,
  timeout = 5000,
  interval = 100
): Promise<T> {
  operation.check();
  const value = await poll(
    () => {
      operation.check();
      return read();
    },
    operation.signal,
    timeout,
    interval
  );
  operation.check();
  return value;
}
export function click(el: Element, operation: Operation) {
  operation.write(() => nativeClick(el));
}
export function writeText(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  operation: Operation
) {
  nativeText(el, value, operation.checkWrite);
  operation.checkWrite();
}
export function assignFile(el: HTMLInputElement, file: File, operation: Operation) {
  nativeFile(el, file, operation.checkWrite);
  operation.checkWrite();
}
