import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { globalPaths } from '../../config/paths.js';
import type { ResolvedConfig } from '../../config/schema.js';
import { AdapterError } from '../../core/errors.js';
import type { NewTask, Task } from '../../core/task.js';
import {
  BaseStorageAdapter,
  type PreflightResult,
  type StorageCapabilities,
  type TaskFilter,
} from './interface.js';

interface TaskIndex {
  tasks: Task[];
}

export class LocalJsonStorageAdapter extends BaseStorageAdapter {
  readonly name = 'local-json';
  readonly capabilities: StorageCapabilities = {
    writable: true,
    realtime: false,
    bodyEditing: true,
  };

  private dbPath: string;

  constructor(config: ResolvedConfig) {
    super();
    this.dbPath = config.storage.path ?? join(globalPaths.data, 'tasks.json');
  }

  async init(): Promise<void> {
    await mkdir(join(this.dbPath, '..'), { recursive: true });
    try {
      await readFile(this.dbPath, 'utf8');
    } catch {
      await writeFile(this.dbPath, JSON.stringify({ tasks: [] } satisfies TaskIndex, null, 2));
    }
  }

  async preflight(): Promise<PreflightResult> {
    try {
      await this.readIndex();
      return { ok: true, message: `Local JSON storage at ${this.dbPath}` };
    } catch {
      return { ok: false, message: `Cannot read storage file: ${this.dbPath}` };
    }
  }

  async list(filter?: TaskFilter): Promise<Task[]> {
    const index = await this.readIndex();
    let tasks = index.tasks;

    if (filter?.ids) tasks = tasks.filter((t) => filter.ids!.includes(t.id));
    if (filter?.status) tasks = tasks.filter((t) => filter.status!.includes(t.status));
    if (filter?.project) tasks = tasks.filter((t) => t.project === filter.project);
    if (filter?.feature) tasks = tasks.filter((t) => t.feature === filter.feature);
    if (filter?.tracker_ticket)
      tasks = tasks.filter((t) => t.tracker_ticket === filter.tracker_ticket);
    if (filter?.tags) tasks = tasks.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)));
    if (filter?.limit) tasks = tasks.slice(0, filter.limit);

    return tasks;
  }

  async get(id: string): Promise<Task | null> {
    const index = await this.readIndex();
    return index.tasks.find((t) => t.id === id) ?? null;
  }

  async create(taskData: NewTask): Promise<Task> {
    const index = await this.readIndex();
    if (index.tasks.some((t) => t.id === taskData.id)) {
      throw new AdapterError('local-json', `Task with ID "${taskData.id}" already exists`);
    }
    const now = new Date().toISOString();
    const task: Task = { ...taskData, created_at: now, updated_at: now };
    index.tasks.push(task);
    await this.writeIndex(index);
    return task;
  }

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const index = await this.readIndex();
    const idx = index.tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new AdapterError('local-json', `Task not found: ${id}`);

    const updated: Task = {
      ...index.tasks[idx],
      ...patch,
      id, // never change the ID
      updated_at: new Date().toISOString(),
    };
    index.tasks[idx] = updated;
    await this.writeIndex(index);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const index = await this.readIndex();
    index.tasks = index.tasks.filter((t) => t.id !== id);
    await this.writeIndex(index);
  }

  private async readIndex(): Promise<TaskIndex> {
    const content = await readFile(this.dbPath, 'utf8');
    return JSON.parse(content) as TaskIndex;
  }

  private async writeIndex(index: TaskIndex): Promise<void> {
    await writeFile(this.dbPath, JSON.stringify(index, null, 2));
  }
}
