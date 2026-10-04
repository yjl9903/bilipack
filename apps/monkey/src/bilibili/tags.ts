import { FieldReadbackError } from '../workflow/port';

export interface TagControls {
  read(): string[];
  remove(index: number, tag: string): Promise<void>;
  add(tag: string): Promise<void>;
  pause(ms: number): Promise<void>;
  finish?(): void;
}

/** Reconcile live recommendations and input resets without clearing wanted tags. */
export async function reconcileTags(
  expected: readonly string[],
  controls: TagControls,
  signal: AbortSignal
) {
  // Allow each target its own two 5s acceptance waits; one slow tag must not
  // consume a short global budget and prevent the remaining targets being tried.
  const deadline = Date.now() + Math.max(20_000, expected.length * 13_000 + 10_000);
  const attempts = new Map<string, number>();
  let stableSince: number | undefined;
  let lastError: unknown;
  const extraIndex = (actual: readonly string[]) => {
    const seen = new Set<string>();
    return actual.findIndex((tag) => {
      if (!expected.includes(tag) || seen.has(tag)) return true;
      seen.add(tag);
      return false;
    });
  };
  const cleanExtras = async () => {
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const actual = controls.read();
      const extra = extraIndex(actual);
      if (extra === -1) return true;
      try {
        await controls.remove(extra, actual[extra]);
      } catch (error) {
        signal.throwIfAborted();
        lastError = error;
      }
      await controls.pause(300);
    }
    return false;
  };
  let finished = false;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const actual = controls.read();
    const extra = extraIndex(actual);
    const missing = expected.find((tag) => !actual.includes(tag));
    if (extra === -1 && missing === undefined) {
      if (!finished) {
        controls.finish?.();
        finished = true;
        // Observe values reverted after blur before declaring stability.
        await controls.pause(700);
        continue;
      }
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= 1500) return;
    } else {
      stableSince = undefined;
      finished = false;
      if (!(await cleanExtras())) break;
      for (const tag of expected) {
        while (!controls.read().includes(tag) && (attempts.get(tag) ?? 0) < 2) {
          signal.throwIfAborted();
          if (Date.now() >= deadline || !(await cleanExtras())) break;
          attempts.set(tag, (attempts.get(tag) ?? 0) + 1);
          try {
            await controls.add(tag);
          } catch (error) {
            signal.throwIfAborted();
            lastError = error;
          }
          await controls.pause(300);
        }
      }
      controls.finish?.();
      finished = true;
      await controls.pause(700);
      const pending = expected.filter((tag) => !controls.read().includes(tag));
      if (pending.length && pending.every((tag) => (attempts.get(tag) ?? 0) >= 2)) break;
    }
    await controls.pause(150);
  }
  signal.throwIfAborted();
  throw new FieldReadbackError(
    '标签经补偿重试仍未稳定' + (lastError instanceof Error ? `；${lastError.message}` : ''),
    [...controls.read()]
  );
}
