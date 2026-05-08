import { useEffect, useRef } from 'react';
import type { StorageAdapter } from '../../adapters/storage/interface.js';
import type { TrackerAdapter } from '../../adapters/tracker/interface.js';
import { useOraleStore } from '../store.js';

export function usePrPolling(
  storage: StorageAdapter | null,
  tracker: TrackerAdapter | null,
  intervalMs = 2 * 60_000,
): void {
  const addNotification = useOraleStore((s) => s.addNotification);
  const projectRoot = useOraleStore((s) => s.projectRoot);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!storage || !tracker) return;

    const poll = async () => {
      try {
        const reviewTasks = await storage.list({
          status: ['code-review'],
          project: projectRoot ?? undefined,
        });

        for (const task of reviewTasks) {
          if (!task.pr_url) continue;

          try {
            const state = await tracker.getPrState(task.pr_url);
            if (!state) continue;

            const isPrMerged = state.state === 'merged';
            const isPrOpen = state.state === 'open';

            if (isPrMerged) {
              await storage.update(task.id, {
                status: 'done',
                completed_at: state.mergedAt ?? new Date().toISOString(),
              });
              addNotification(`[${task.id}] PR merged → done`, 'success', task.id);
            } else if (isPrOpen) {
              // Check for new review comments
              try {
                const threads = await tracker.fetchUnresolvedReviewComments(task.pr_url);
                if (threads.length > 0) {
                  addNotification(
                    `[${task.id}] ${threads.length} unresolved review comment${threads.length !== 1 ? 's' : ''} — press enter to address`,
                    'warn',
                    task.id,
                  );
                }
              } catch {
                // ignore comment fetch errors
              }
            }
          } catch {
            // ignore per-PR errors
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [storage, tracker, projectRoot, intervalMs, addNotification]);
}
