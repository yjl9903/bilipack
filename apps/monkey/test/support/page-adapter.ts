import { vi } from 'vitest';
import type { PageAdapter, PageContext } from '../../src/workflow/port';
/** In-memory PageAdapter: fields retain values; attachment/video evidence defaults to success. */
export function fakeAdapter(overrides: Partial<PageAdapter> = {}): PageAdapter {
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
      values.set(t.field, Array.isArray(t.value) ? [...t.value] : t.value);
    }),
    verifyField: async (t) => ({
      matches: JSON.stringify(values.get(t.field)) === JSON.stringify(t.value),
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
