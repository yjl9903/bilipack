import { afterEach, vi } from 'vitest';
import { cleanupResources } from './support/cleanup';

afterEach(() => {
  try {
    // Dispose Vue/controller resources while their browser API replacements still exist.
    cleanupResources();
  } finally {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  }
});
