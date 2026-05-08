import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'todo',
  'in-progress',
  'code-review',
  'done',
  'blocked',
  'failed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  batch: z.number().int().min(1).default(1),
  dependencies: z.array(z.string()).default([]),
  project: z.string(),
  files_to_modify: z.array(z.string()).default([]),
  feature: z.string().default(''),
  body: z.string().default(''),
  tracker_ticket: z.string().optional(),
  pr_strategy: z
    .enum(['pr-per-task', 'pr-per-task-to-integration', 'local-integration'])
    .optional(),
  integration_branch: z.string().optional(),
  pr_url: z.string().optional(),
  branch_name: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  error: z.string().optional(),
  retry_hint: z.string().optional(),
  tags: z.array(z.string()).default([]),
  // Storage-managed metadata
  storage_ref: z.string().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().default(() => new Date().toISOString()),
});

export type Task = z.infer<typeof TaskSchema>;
export type NewTask = Omit<Task, 'created_at' | 'updated_at' | 'storage_ref'>;

export const TERMINAL_STATUSES: TaskStatus[] = ['done', 'failed'];
export const ACTIVE_STATUSES: TaskStatus[] = ['in-progress'];
export const ELIGIBLE_STATUSES: TaskStatus[] = ['todo'];

export function isTaskEligible(task: Task, retryFailed = false): boolean {
  return task.status === 'todo' || (retryFailed && task.status === 'failed');
}

export function hasDependenciesResolved(task: Task, statusMap: Map<string, string>): boolean {
  return task.dependencies.every((dep) => statusMap.get(dep) === 'done');
}
