import type { TrackerConfig } from '../config/schema.js';
import type { Task } from './task.js';

function toSlug(text: string, maxLength = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, maxLength)
    .replace(/-$/, '');
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? key);
}

const DEFAULT_BRANCH_TEMPLATE = 'feature/{ticket}-{id}-{slug}';
const DEFAULT_FALLBACK_TEMPLATE = 'task/{id}';

export function buildBranchName(task: Task, trackerConfig: TrackerConfig): string {
  if (task.tracker_ticket) {
    const slug = toSlug(task.title, 20);
    return interpolate(trackerConfig.branchTemplate ?? DEFAULT_BRANCH_TEMPLATE, {
      ticket: task.tracker_ticket,
      id: task.id,
      slug,
    });
  }

  return interpolate(trackerConfig.branchFallbackTemplate ?? DEFAULT_FALLBACK_TEMPLATE, {
    id: task.id,
    slug: toSlug(task.title, 20),
  });
}
