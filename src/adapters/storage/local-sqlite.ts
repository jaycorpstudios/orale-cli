import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { globalPaths } from '../../config/paths.js';
import type { ResolvedConfig } from '../../config/schema.js';
import { AdapterError } from '../../core/errors.js';
import type { NewTask, Task, TaskStatus } from '../../core/task.js';
import {
  BaseStorageAdapter,
  type PreflightResult,
  type StorageCapabilities,
  type TaskFilter,
} from './interface.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  batch INTEGER NOT NULL DEFAULT 1,
  dependencies TEXT NOT NULL DEFAULT '[]',
  project TEXT NOT NULL,
  files_to_modify TEXT NOT NULL DEFAULT '[]',
  feature TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tracker_ticket TEXT,
  pr_url TEXT,
  branch_name TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  retry_hint TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  storage_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature);
`;

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as TaskStatus,
    batch: row.batch as number,
    dependencies: JSON.parse(row.dependencies as string) as string[],
    project: row.project as string,
    files_to_modify: JSON.parse(row.files_to_modify as string) as string[],
    feature: row.feature as string,
    body: row.body as string,
    tracker_ticket: (row.tracker_ticket as string) || undefined,
    pr_url: (row.pr_url as string) || undefined,
    branch_name: (row.branch_name as string) || undefined,
    started_at: (row.started_at as string) || undefined,
    completed_at: (row.completed_at as string) || undefined,
    error: (row.error as string) || undefined,
    retry_hint: (row.retry_hint as string) || undefined,
    tags: JSON.parse(row.tags as string) as string[],
    storage_ref: (row.storage_ref as string) || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function taskToRow(task: Task | NewTask, now: string): Record<string, string | number | null> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    batch: task.batch,
    dependencies: JSON.stringify(task.dependencies),
    project: task.project,
    files_to_modify: JSON.stringify(task.files_to_modify),
    feature: task.feature,
    body: task.body,
    tracker_ticket: task.tracker_ticket ?? null,
    pr_url: task.pr_url ?? null,
    branch_name: task.branch_name ?? null,
    started_at: task.started_at ?? null,
    completed_at: task.completed_at ?? null,
    error: task.error ?? null,
    retry_hint: task.retry_hint ?? null,
    tags: JSON.stringify(task.tags),
    storage_ref: 'storage_ref' in task ? (task.storage_ref ?? null) : null,
    created_at: ('created_at' in task ? task.created_at : null) ?? now,
    updated_at: now,
  };
}

export class LocalSqliteStorageAdapter extends BaseStorageAdapter {
  readonly name = 'local-sqlite';
  readonly capabilities: StorageCapabilities = {
    writable: true,
    realtime: false,
    bodyEditing: true,
  };

  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(config: ResolvedConfig) {
    super();
    this.dbPath = config.storage.path ?? join(globalPaths.data, 'orale.db');
  }

  async init(): Promise<void> {
    await mkdir(join(this.dbPath, '..'), { recursive: true });
    // Function() prevents esbuild from statically analyzing the import specifier;
    // a plain import('node:sqlite') has its 'node:' prefix stripped by esbuild at build time
    const { DatabaseSync: Ctor } = await (Function('return import("node:sqlite")')() as Promise<
      typeof import('node:sqlite')
    >);
    this.db = new Ctor(this.dbPath);
    this.db.exec(SCHEMA);
  }

  async preflight(): Promise<PreflightResult> {
    try {
      if (!this.db) await this.init();
      this.db!.prepare('SELECT 1').get();
      return { ok: true, message: `SQLite database at ${this.dbPath}` };
    } catch (err) {
      return { ok: false, message: `Cannot open SQLite database: ${err}` };
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private getDb(): DatabaseSync {
    if (!this.db) throw new AdapterError('local-sqlite', 'Not initialized — call init() first');
    return this.db;
  }

  async list(filter?: TaskFilter): Promise<Task[]> {
    const db = this.getDb();
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: (string | number | null)[] = [];

    if (filter?.project) {
      sql += ' AND project = ?';
      params.push(filter.project);
    }
    if (filter?.feature) {
      sql += ' AND feature = ?';
      params.push(filter.feature);
    }
    if (filter?.tracker_ticket) {
      sql += ' AND tracker_ticket = ?';
      params.push(filter.tracker_ticket);
    }
    if (filter?.status && filter.status.length > 0) {
      sql += ` AND status IN (${filter.status.map(() => '?').join(',')})`;
      params.push(...filter.status);
    }
    if (filter?.ids && filter.ids.length > 0) {
      sql += ` AND id IN (${filter.ids.map(() => '?').join(',')})`;
      params.push(...filter.ids);
    }
    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    let tasks = rows.map(rowToTask);

    if (filter?.tags && filter.tags.length > 0) {
      tasks = tasks.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)));
    }

    return tasks;
  }

  async get(id: string): Promise<Task | null> {
    const row = this.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToTask(row) : null;
  }

  async create(taskData: NewTask): Promise<Task> {
    const now = new Date().toISOString();
    const row = taskToRow(taskData, now);
    const cols = Object.keys(row).join(', ');
    const placeholders = Object.keys(row)
      .map(() => '?')
      .join(', ');
    try {
      this.getDb()
        .prepare(`INSERT INTO tasks (${cols}) VALUES (${placeholders})`)
        .run(...Object.values(row));
    } catch (err) {
      if (String(err).includes('UNIQUE constraint')) {
        throw new AdapterError('local-sqlite', `Task with ID "${taskData.id}" already exists`);
      }
      throw err;
    }
    return rowToTask({ ...row });
  }

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const existing = await this.get(id);
    if (!existing) throw new AdapterError('local-sqlite', `Task not found: ${id}`);

    const now = new Date().toISOString();
    const updated: Task = { ...existing, ...patch, id, updated_at: now };
    const row = taskToRow(updated, now);

    const setClauses = Object.keys(row)
      .filter((k) => k !== 'id')
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.entries(row)
      .filter(([k]) => k !== 'id')
      .map(([, v]) => v);

    this.getDb()
      .prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`)
      .run(...values, id);

    return updated;
  }

  async delete(id: string): Promise<void> {
    this.getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  async bulkUpdate(updates: Array<{ id: string; patch: Partial<Task> }>): Promise<Task[]> {
    const db = this.getDb();
    const results: Task[] = [];

    db.exec('BEGIN');
    try {
      for (const { id, patch } of updates) {
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
          | Record<string, unknown>
          | undefined;
        if (!existing) continue;

        const now = new Date().toISOString();
        const updated: Task = { ...rowToTask(existing), ...patch, id, updated_at: now };
        const row = taskToRow(updated, now);

        const setClauses = Object.keys(row)
          .filter((k) => k !== 'id')
          .map((k) => `${k} = ?`)
          .join(', ');
        const values = Object.entries(row)
          .filter(([k]) => k !== 'id')
          .map(([, v]) => v);

        db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values, id);
        results.push(updated);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    return results;
  }
}
