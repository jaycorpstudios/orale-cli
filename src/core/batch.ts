import { DependencyCycleError } from './errors.js';
import type { Task } from './task.js';

export interface Batch {
  batchNumber: number;
  tasks: Task[];
}

/**
 * Organise tasks into ordered batches using Kahn's topological sort.
 * Batch 1 = tasks with no dependencies in the set.
 * Batch N = tasks whose dependencies are all in batches < N.
 * Throws on circular dependencies or unknown dependency IDs.
 *
 * @param preResolved - IDs of tasks outside the set that are already done.
 */
export function buildBatches(tasks: Task[], preResolved: Set<string> = new Set()): Batch[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!byId.has(dep) && !preResolved.has(dep)) {
        throw new Error(`Task ${task.id} depends on "${dep}" which is not in the task set`);
      }
    }
  }

  const batches: Batch[] = [];
  const assigned = new Set<string>(preResolved);
  let remaining = tasks.map((t) => t.id);

  while (remaining.length > 0) {
    const ready = remaining.filter((id) => {
      const task = byId.get(id)!;
      return task.dependencies.every((dep) => assigned.has(dep));
    });

    if (ready.length === 0) {
      const cycle = detectCycle(tasks, new Set(remaining), byId);
      throw new DependencyCycleError(cycle);
    }

    batches.push({
      batchNumber: batches.length + 1,
      tasks: ready.map((id) => byId.get(id)!),
    });

    for (const id of ready) assigned.add(id);
    remaining = remaining.filter((id) => !assigned.has(id));
  }

  return batches;
}

function detectCycle(tasks: Task[], remaining: Set<string>, byId: Map<string, Task>): string {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): boolean {
    visited.add(id);
    stack.add(id);
    path.push(id);

    const task = byId.get(id);
    if (!task) return false;

    for (const dep of task.dependencies) {
      if (!remaining.has(dep)) continue;
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (stack.has(dep)) {
        path.push(dep);
        return true;
      }
    }

    stack.delete(id);
    path.pop();
    return false;
  }

  for (const id of remaining) {
    if (!visited.has(id)) {
      if (dfs(id)) break;
    }
  }

  return path.join(' -> ');
}
