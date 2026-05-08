import type { Command } from 'commander';
import { createDefaultRegistry } from '../../adapters/registry.js';
import { loadConfig } from '../../config/loader.js';
import type { NewTask, Task, TaskStatus } from '../../core/task.js';
import { log } from '../../lib/logger.js';

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '\x1b[37m',
  'in-progress': '\x1b[33m',
  'code-review': '\x1b[36m',
  done: '\x1b[32m',
  blocked: '\x1b[35m',
  failed: '\x1b[31m',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function colorStatus(status: TaskStatus): string {
  const color = STATUS_COLORS[status] ?? '';
  return `${color}${status}${RESET}`;
}

export function registerTasksCommand(program: Command): void {
  const tasks = program
    .command('tasks')
    .description('Manage tasks (list, show, create, move, edit)');

  // orale tasks list
  tasks
    .command('list')
    .description('List tasks')
    .option('--project <path>', 'Filter by project path')
    .option('--status <status>', 'Filter by status (comma-separated)')
    .option('--feature <feature>', 'Filter by feature/epic')
    .option('--json', 'Output as JSON', false)
    .action(
      async (opts: {
        project?: string;
        status?: string;
        feature?: string;
        json: boolean;
      }) => {
        const { config } = await loadConfig(opts.project);
        const registry = await createDefaultRegistry(config);
        const storage = registry.resolveStorage(config);
        await storage.init();

        const statusFilter = opts.status
          ? (opts.status.split(',').map((s) => s.trim()) as TaskStatus[])
          : undefined;

        const taskList = await storage.list({
          project: opts.project,
          status: statusFilter,
          feature: opts.feature,
        });

        await storage.close?.();

        if (opts.json) {
          console.log(JSON.stringify(taskList, null, 2));
          return;
        }

        if (taskList.length === 0) {
          log.info('No tasks found.');
          return;
        }

        console.log('');
        for (const task of taskList) {
          console.log(`  ${BOLD}${task.id}${RESET}  ${colorStatus(task.status)}  ${task.title}`);
          if (task.feature) console.log(`     Feature: ${task.feature}`);
          if (task.pr_url) console.log(`     PR: ${task.pr_url}`);
          if (task.dependencies.length > 0)
            console.log(`     Deps: ${task.dependencies.join(', ')}`);
          console.log('');
        }
      },
    );

  // orale tasks show <id>
  tasks
    .command('show <id>')
    .description('Show task details')
    .option('--project <path>', 'Project root (for config loading)')
    .action(async (id: string, opts: { project?: string }) => {
      const { config } = await loadConfig(opts.project);
      const registry = await createDefaultRegistry(config);
      const storage = registry.resolveStorage(config);
      await storage.init();

      const task = await storage.get(id);
      await storage.close?.();

      if (!task) {
        log.error(`Task not found: ${id}`);
        process.exit(1);
      }

      console.log(JSON.stringify(task, null, 2));
    });

  // orale tasks move <id> --status <new-status>
  tasks
    .command('move <id>')
    .description('Update the status of a task')
    .requiredOption('--status <status>', 'New status')
    .option('--project <path>', 'Project root (for config loading)')
    .action(async (id: string, opts: { status: string; project?: string }) => {
      const { config } = await loadConfig(opts.project);
      const registry = await createDefaultRegistry(config);
      const storage = registry.resolveStorage(config);
      await storage.init();

      const task = await storage.get(id);
      if (!task) {
        log.error(`Task not found: ${id}`);
        await storage.close?.();
        process.exit(1);
      }

      const updated = await storage.update(id, { status: opts.status as TaskStatus });
      await storage.close?.();
      log.success(`[${id}] Status updated: ${task.status} → ${updated.status}`);
    });

  // orale tasks create-batch --json <json>
  tasks
    .command('create-batch')
    .description('Create multiple tasks from a JSON array (used by /orale:tasks skill)')
    .requiredOption('--json <json>', 'JSON array of task objects')
    .option('--project <path>', 'Project root (for config loading)')
    .action(async (opts: { json: string; project?: string }) => {
      let taskDataArray: NewTask[];
      try {
        taskDataArray = JSON.parse(opts.json) as NewTask[];
      } catch (err) {
        log.error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      const { config } = await loadConfig(opts.project);
      const registry = await createDefaultRegistry(config);
      const storage = registry.resolveStorage(config);
      await storage.init();

      const created: Task[] = [];
      for (const taskData of taskDataArray) {
        try {
          const task = await storage.create(taskData);
          created.push(task);
          log.success(`Created task: ${task.id} — ${task.title}`);
        } catch (err) {
          log.error(
            `Failed to create task ${taskData.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      await storage.close?.();
      log.success(`\n${created.length}/${taskDataArray.length} tasks created.`);

      if (created.length > 0) {
        console.log('\nCreated task IDs:');
        for (const task of created) {
          console.log(`  ${task.id}: ${task.title}`);
        }
      }
    });
}
