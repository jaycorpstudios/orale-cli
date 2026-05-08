import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ResolvedConfig } from '../../config/schema.js';
import { AdapterError } from '../../core/errors.js';
import type { NewTask, Task, TaskStatus } from '../../core/task.js';
import {
  BaseStorageAdapter,
  type PreflightResult,
  type StorageCapabilities,
  type TaskFilter,
} from './interface.js';

const execFileAsync = promisify(execFile);

function parseTask(filePath: string, rawContent: string): Task {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new AdapterError('obsidian', `No valid frontmatter found in: ${filePath}`);

  const fm = parseYaml(match[1]) as Record<string, unknown>;
  const body = match[2].trim();
  const now = new Date().toISOString();

  return {
    id: String(fm.id ?? ''),
    title: String(fm.title ?? ''),
    status: (fm.status as TaskStatus) ?? 'todo',
    batch: Number(fm.batch ?? 1),
    dependencies: Array.isArray(fm.dependencies) ? fm.dependencies.map(String) : [],
    project: String(fm.project ?? ''),
    files_to_modify: Array.isArray(fm.files_to_modify) ? fm.files_to_modify.map(String) : [],
    feature: String(fm.feature ?? ''),
    tracker_ticket: String(fm.tracker_ticket ?? '') || undefined,
    pr_url: String(fm.pr_url ?? '') || undefined,
    branch_name: String(fm.branch_name ?? '') || undefined,
    started_at: String(fm.started_at ?? '') || undefined,
    completed_at: String(fm.completed_at ?? '') || undefined,
    error: String(fm.error ?? '') || undefined,
    retry_hint: String(fm.retry_hint ?? '') || undefined,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    storage_ref: filePath,
    created_at: now,
    updated_at: now,
    body,
  };
}

export class ObsidianStorageAdapter extends BaseStorageAdapter {
  readonly name = 'obsidian';
  readonly capabilities: StorageCapabilities = {
    writable: true,
    realtime: false,
    bodyEditing: true,
  };

  private vault: string;
  private cliPath: string;

  constructor(config: ResolvedConfig) {
    super();
    this.vault = config.storage.obsidian?.vault ?? 'task-management';
    this.cliPath = config.storage.obsidian?.cli ?? 'obsidian-cli';
  }

  private async cli(...args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(this.cliPath, [
        `vault=${this.vault}`,
        ...args,
      ]);
      if (stderr) throw new Error(stderr.trim());
      return stdout.trim();
    } catch (err) {
      throw new AdapterError('obsidian', err instanceof Error ? err.message : String(err));
    }
  }

  async init(): Promise<void> {
    // No initialization needed for Obsidian
  }

  async preflight(): Promise<PreflightResult> {
    try {
      await this.cli('vault', 'info=name');
      return { ok: true, message: `Obsidian vault "${this.vault}" is reachable` };
    } catch (err) {
      return {
        ok: false,
        message: `Cannot reach Obsidian vault "${this.vault}". Is Obsidian running? ${err}`,
      };
    }
  }

  async list(filter?: TaskFilter): Promise<Task[]> {
    let output: string;
    try {
      output = await this.cli('files', 'ext=md');
    } catch {
      return [];
    }

    if (!output) return [];

    const filePaths = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.endsWith('_index.md'));

    const tasks: Task[] = [];
    for (const filePath of filePaths) {
      try {
        const task = await this.readTask(filePath);
        if (this.matchesFilter(task, filter)) {
          tasks.push(task);
        }
      } catch {
        // skip invalid files
      }
    }

    return filter?.limit ? tasks.slice(0, filter.limit) : tasks;
  }

  async get(id: string): Promise<Task | null> {
    let output: string;
    try {
      output = await this.cli('search', `query=${id}`, 'format=json');
    } catch {
      return null;
    }

    if (!output || output === 'No matches found.') return null;

    const paths = JSON.parse(output) as string[];
    for (const filePath of paths) {
      try {
        const task = await this.readTask(filePath);
        if (task.id === id) return task;
      } catch {
        // skip
      }
    }
    return null;
  }

  async create(taskData: NewTask): Promise<Task> {
    const fm: Record<string, unknown> = {
      id: taskData.id,
      title: taskData.title,
      status: taskData.status,
      batch: taskData.batch,
      dependencies: taskData.dependencies,
      project: taskData.project,
      files_to_modify: taskData.files_to_modify,
      feature: taskData.feature,
      tracker_ticket: taskData.tracker_ticket ?? '',
      pr_url: taskData.pr_url ?? '',
      branch_name: taskData.branch_name ?? '',
      started_at: taskData.started_at ?? '',
      completed_at: taskData.completed_at ?? '',
      error: taskData.error ?? '',
      retry_hint: taskData.retry_hint ?? '',
      tags: taskData.tags,
    };

    const content = `---\n${stringifyYaml(fm)}---\n\n${taskData.body}`;
    const filePath = `${taskData.feature}/${taskData.id} ${taskData.title}.md`;

    await this.cli('create', `path=${filePath}`, `content=${content}`, 'overwrite');
    const now = new Date().toISOString();
    return { ...taskData, storage_ref: filePath, created_at: now, updated_at: now };
  }

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const task = await this.get(id);
    if (!task) throw new AdapterError('obsidian', `Task not found: ${id}`);

    const filePath = task.storage_ref!;
    const fieldMap: Record<string, string> = {
      status: 'status',
      pr_url: 'pr_url',
      branch_name: 'branch_name',
      started_at: 'started_at',
      completed_at: 'completed_at',
      error: 'error',
      retry_hint: 'retry_hint',
    };

    for (const [key, obsidianKey] of Object.entries(fieldMap)) {
      if (key in patch) {
        const value = patch[key as keyof typeof patch];
        await this.cli(
          'property:set',
          `path=${filePath}`,
          `name=${obsidianKey}`,
          `value=${value ?? ''}`,
        );
      }
    }

    const updated = { ...task, ...patch, updated_at: new Date().toISOString() };
    return updated;
  }

  private async readTask(filePath: string): Promise<Task> {
    const content = await this.cli('read', `path=${filePath}`);
    return parseTask(filePath, content);
  }

  private matchesFilter(task: Task, filter?: TaskFilter): boolean {
    if (!filter) return true;
    if (filter.ids && !filter.ids.includes(task.id)) return false;
    if (filter.status && !filter.status.includes(task.status)) return false;
    if (filter.project && task.project !== filter.project) return false;
    if (filter.feature && task.feature !== filter.feature) return false;
    if (filter.tracker_ticket && task.tracker_ticket !== filter.tracker_ticket) return false;
    if (filter.tags && !filter.tags.some((t) => task.tags.includes(t))) return false;
    return true;
  }
}
