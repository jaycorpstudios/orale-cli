import type { NewTask, Task, TaskStatus } from '../../core/task.js';

export interface PreflightResult {
  ok: boolean;
  message: string;
}

export interface TaskFilter {
  ids?: string[];
  status?: TaskStatus[];
  project?: string;
  feature?: string;
  tags?: string[];
  tracker_ticket?: string;
  limit?: number;
}

export type TaskEvent =
  | { kind: 'created'; task: Task }
  | { kind: 'updated'; task: Task }
  | { kind: 'deleted'; id: string };

export type Unsubscribe = () => void;

export interface StorageCapabilities {
  writable: boolean;
  realtime: boolean;
  bodyEditing: boolean;
}

export interface StorageAdapter {
  readonly name: string;
  readonly capabilities: StorageCapabilities;

  init(): Promise<void>;
  preflight(): Promise<PreflightResult>;
  close?(): Promise<void>;

  list(filter?: TaskFilter): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  create(task: NewTask): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<Task>;
  delete?(id: string): Promise<void>;

  bulkUpdate?(updates: Array<{ id: string; patch: Partial<Task> }>): Promise<Task[]>;
  subscribe?(filter: TaskFilter, onChange: (event: TaskEvent) => void): Unsubscribe;
}

export abstract class BaseStorageAdapter implements StorageAdapter {
  abstract readonly name: string;
  abstract readonly capabilities: StorageCapabilities;

  abstract init(): Promise<void>;
  abstract preflight(): Promise<PreflightResult>;
  abstract list(filter?: TaskFilter): Promise<Task[]>;
  abstract get(id: string): Promise<Task | null>;
  abstract create(task: NewTask): Promise<Task>;
  abstract update(id: string, patch: Partial<Task>): Promise<Task>;

  async bulkUpdate(updates: Array<{ id: string; patch: Partial<Task> }>): Promise<Task[]> {
    return Promise.all(updates.map(({ id, patch }) => this.update(id, patch)));
  }

  subscribe(filter: TaskFilter, onChange: (event: TaskEvent) => void): Unsubscribe {
    let lastSnapshot = new Map<string, Task>();
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const tasks = await this.list(filter);
        const currentSnapshot = new Map(tasks.map((t) => [t.id, t]));

        // Detect created/updated
        for (const [id, task] of currentSnapshot) {
          const prev = lastSnapshot.get(id);
          if (!prev) {
            onChange({ kind: 'created', task });
          } else if (prev.updated_at !== task.updated_at) {
            onChange({ kind: 'updated', task });
          }
        }

        // Detect deleted
        for (const [id] of lastSnapshot) {
          if (!currentSnapshot.has(id)) {
            onChange({ kind: 'deleted', id });
          }
        }

        lastSnapshot = currentSnapshot;
      } catch {
        // Ignore polling errors
      }
      if (!stopped) setTimeout(poll, 5000);
    };

    poll();
    return () => {
      stopped = true;
    };
  }
}
