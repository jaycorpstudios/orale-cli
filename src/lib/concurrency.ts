/**
 * Run async tasks with bounded concurrency.
 * Returns a map of item → result (true = success, false = failed).
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<Map<T, boolean>> {
  const results = new Map<T, boolean>();

  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          await fn(item);
          results.set(item, true);
        } catch {
          results.set(item, false);
        }
      }),
    );
  }

  return results;
}

/**
 * Simple async mutex for serializing operations that must not run concurrently.
 */
export function createMutex() {
  let lock = Promise.resolve();

  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = lock.then(fn);
    lock = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
