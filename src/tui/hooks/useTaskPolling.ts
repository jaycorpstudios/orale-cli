import { useEffect, useRef } from 'react';
import type { StorageAdapter } from '../../adapters/storage/interface.js';
import { useOraleStore } from '../store.js';

export function useTaskPolling(storage: StorageAdapter | null, intervalMs = 4000): void {
  const setTasks = useOraleStore((s) => s.setTasks);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!storage) return;

    const poll = async () => {
      try {
        // Show all tasks — user can filter by project via /filter in TUI
        const tasks = await storage.list();
        setTasks(tasks);
      } catch {
        // ignore transient errors
      }
    };

    // Initial load
    poll();

    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [storage, intervalMs, setTasks]);
}
