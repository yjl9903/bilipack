const cleanups: (() => void)[] = [];

/** Register as soon as a resource is created; explicit cleanup remains safe to call. */
export function onCleanup(cleanup: () => void): () => void {
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    cleanup();
  };
  cleanups.push(dispose);
  return dispose;
}

export function cleanupResources() {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Test resource cleanup failed');
}
