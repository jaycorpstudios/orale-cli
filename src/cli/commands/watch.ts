import type { Command } from 'commander';
import { createDefaultRegistry } from '../../adapters/registry.js';
import { loadConfig } from '../../config/loader.js';
import { Orchestrator } from '../../core/orchestrator.js';
import type { Task } from '../../core/task.js';
import { hasDependenciesResolved } from '../../core/task.js';
import { log } from '../../lib/logger.js';

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Continuously poll for in-progress tasks and execute them (daemon)')
    .requiredOption('--project <path>', 'Absolute path to the project directory')
    .option('--poll-interval <seconds>', 'Polling interval in seconds', '10')
    .option('--max-parallel <n>', 'Max concurrent agent executions', '3')
    .action(
      async (opts: {
        project: string;
        pollInterval: string;
        maxParallel: string;
      }) => {
        const projectPath = opts.project;
        const pollIntervalMs = Number.parseInt(opts.pollInterval, 10) * 1000;
        const maxParallel = Number.parseInt(opts.maxParallel, 10);

        const { config } = await loadConfig(projectPath);
        const registry = await createDefaultRegistry(config);

        const storage = registry.resolveStorage(config);
        const agent = registry.resolveAgent(config);
        const tracker = registry.resolveTracker(config);

        await storage.init();

        const orchestrator = new Orchestrator(storage, agent, tracker, config);

        const active = new Map<string, Promise<void>>();
        let shuttingDown = false;

        process.on('SIGINT', async () => {
          log.info('Shutting down gracefully — waiting for active tasks...');
          shuttingDown = true;

          if (active.size > 0) {
            await Promise.allSettled([...active.values()]);
          }

          await storage.close?.();
          log.info('orale watch stopped.');
          process.exit(0);
        });

        log.info(
          `orale watch started — polling every ${pollIntervalMs / 1000}s (max ${maxParallel} parallel)`,
        );

        const poll = async () => {
          if (shuttingDown) return;

          try {
            // Sync merged PRs first
            const synced = await orchestrator.syncMergedPRs();
            if (synced > 0) log.success(`${synced} task(s) promoted to done.`);

            // Get all tasks for this project
            const allTasks = await storage.list({ project: projectPath });
            const statusMap = new Map(allTasks.map((t) => [t.id, t.status]));

            for (const task of allTasks) {
              if (shuttingDown) break;

              const isReadyToExecute = task.status === 'in-progress';
              const isAlreadyExecuting = active.has(task.id);
              const isAtCapacity = active.size >= maxParallel;

              if (!isReadyToExecute) continue;
              if (isAlreadyExecuting) continue;
              if (isAtCapacity) continue;

              const dependenciesResolved = hasDependenciesResolved(task, statusMap);
              if (!dependenciesResolved) {
                const blockingDependency = task.dependencies.find(
                  (dep) => statusMap.get(dep) !== 'done',
                );
                log.info(`[${task.id}] Blocked by ${blockingDependency} — marking as blocked`);
                await storage.update(task.id, { status: 'blocked' });
                continue;
              }

              const promise = executeAndRemove(task);
              active.set(task.id, promise);
            }
          } catch (err) {
            log.error(`Poll error: ${err instanceof Error ? err.message : String(err)}`);
          }

          if (!shuttingDown) {
            setTimeout(poll, pollIntervalMs);
          }
        };

        async function executeAndRemove(task: Task): Promise<void> {
          try {
            await orchestrator.executeTask(task, projectPath);
          } finally {
            active.delete(task.id);
          }
        }

        poll();
      },
    );
}
