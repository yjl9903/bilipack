import type { FieldTarget } from 'bilipack';
import type { CoverImage } from '../input/types';
export type VideoState = 'absent' | 'uploading' | 'ready' | 'failed' | 'unknown';
export interface PageContext {
  identity: string;
  generation: number;
  video: VideoState;
  count: number;
  /** Maximum count authorized for this empty-page upload. */
  uploadCount?: number;
  target: boolean;
  editor: boolean;
  submissionWaiting?: boolean;
}
/** Empty pages may receive the declared upload; existing pages must retain their count. */
export function matchesContext(expected: PageContext, actual: PageContext): boolean {
  return (
    actual.target &&
    actual.identity === expected.identity &&
    actual.generation === expected.generation &&
    (expected.count === 0
      ? actual.count <= (expected.uploadCount ?? 1)
      : actual.count === expected.count)
  );
}
export interface Evidence {
  matches: boolean;
  actual?: unknown;
  message: string;
}
export interface Capability {
  available: boolean;
  reason?: string;
}
/** No generic click/submit API. All operations are scoped to a specific target. */
export interface PageAdapter {
  context(): PageContext;
  validateVideo(file: File): void;
  assertContext(expected: PageContext): void;
  capability(field: string, value?: unknown): Capability;
  readField(field: string): unknown;
  applyField(target: FieldTarget, signal: AbortSignal, page: PageContext): Promise<void>;
  verifyField(target: FieldTarget, signal: AbortSignal, page: PageContext): Promise<Evidence>;
  readVideo(part: number): { title: string; state: VideoState };
  renameVideo(part: number, title: string, signal: AbortSignal, page: PageContext): Promise<void>;
  uploadVideos(files: readonly File[], signal: AbortSignal, page: PageContext): Promise<void>;
  waitEditor(signal: AbortSignal, page: PageContext): Promise<void>;
  verifyEditor(): Evidence;
  waitVideo(signal: AbortSignal, page: PageContext, part: number): Promise<void>;
  verifyVideo(part: number): Evidence;
  applyCovers(
    files: readonly Pick<CoverImage, 'ratio' | 'source'>[],
    signal: AbortSignal,
    page: PageContext
  ): Promise<void>;
  verifyCover(ratio: '16:9' | '4:3', signal: AbortSignal, page: PageContext): Promise<Evidence>;
  applySubtitle(
    language: string,
    file: File,
    signal: AbortSignal,
    page: PageContext
  ): Promise<void>;
  verifySubtitle(language: string, signal: AbortSignal, page: PageContext): Promise<Evidence>;
  stable(): boolean;
}

/** Keep readable failure reasons separate from values rendered by the comparison UI. */
export class FieldReadbackError extends Error {
  constructor(
    message: string,
    readonly actual: unknown
  ) {
    super(message);
    this.name = 'FieldReadbackError';
  }
}
