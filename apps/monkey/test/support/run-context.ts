import type { Prepared } from '../../src/input/types';
import type { RunContext } from '../../src/workflow/types';
import { fakeAdapter } from './page-adapter';
export function context(prepared: Partial<Prepared> = {}, adapter = fakeAdapter()): RunContext {
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
