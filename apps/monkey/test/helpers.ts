import { vi } from 'vitest';
import type { PageAdapter, PageContext } from '../src/workflow/port';
import type { CoverImage, Prepared } from '../src/input/types';
import type { RunContext } from '../src/workflow/types';
export function mockAdapter(overrides: Partial<PageAdapter> = {}): PageAdapter {
  const values = new Map<string, unknown>();
  const page: PageContext = {
    target: true,
    editor: true,
    video: 'ready',
    count: 1,
    identity: 'test',
    generation: 1
  };
  return {
    context: () => ({ ...page }),
    validateVideo: vi.fn(),
    assertContext: vi.fn(),
    capability: () => ({ available: true }),
    readField: (field) => values.get(field),
    applyField: vi.fn(async (t) => {
      values.set(t.field, t.value);
    }),
    verifyField: async (t) => ({
      matches: values.get(t.field) === t.value,
      actual: values.get(t.field),
      message: 'readback'
    }),
    uploadVideo: vi.fn(async () => {}),
    waitEditor: vi.fn(async () => {}),
    verifyEditor: () => ({ matches: true, message: '编辑表单可操作' }),
    waitVideo: vi.fn(async () => {}),
    verifyVideo: () => ({ matches: true, message: 'done' }),
    applyCovers: vi.fn(async () => {}),
    verifyCover: async () => ({ matches: true, message: 'done' }),
    applySubtitle: vi.fn(async () => {}),
    verifySubtitle: async () => ({ matches: true, message: 'done' }),
    stable: () => true,
    ...overrides
  };
}
export function context(prepared: Partial<Prepared> = {}, adapter = mockAdapter()): RunContext {
  return {
    prepared: {
      raw: '',
      config: { info: { title: '目标' } },
      covers: [],
      subtitles: [],
      ...prepared
    },
    adapter,
    page: adapter.context(),
    signal: new AbortController().signal
  };
}
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
