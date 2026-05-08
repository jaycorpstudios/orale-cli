import type { Command } from 'commander';
import { createDefaultRegistry } from '../../adapters/registry.js';
import { loadConfig } from '../../config/loader.js';
import type { PrStrategy } from '../../config/schema.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { log } from '../../lib/logger.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <task-ids>')
    .description('Execute one or more tasks by ID (comma-separated)')
    .requiredOption('--project <path>', 'Absolute path to the project directory')
    .option('--max-parallel <n>', 'Max concurrent agent executions', '3')
    .option('--dry-run', 'Print batch plan without executing', false)
    .option('--retry-failed', 'Reset failed tasks to todo and re-execute', false)
    .option('--extra-prompt <text>', 'Append additional context to the agent prompt')
    .option(
      '--pr-strategy <strategy>',
      'PR strategy: pr-per-task | pr-per-task-to-integration | local-integration',
    )
    .option(
      '--integration-branch <branch>',
      'Integration branch name (required for pr-per-task-to-integration and local-integration)',
    )
    .action(
      async (
        taskIdsArg: string,
        opts: {
          project: string;
          maxParallel: string;
          dryRun: boolean;
          retryFailed: boolean;
          extraPrompt?: string;
          prStrategy?: string;
          integrationBranch?: string;
        },
      ) => {
        const taskIds = taskIdsArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        if (taskIds.length === 0) {
          log.error('No task IDs provided');
          process.exit(1);
        }

        const { config } = await loadConfig(opts.project);
        const registry = await createDefaultRegistry(config);

        const storage = registry.resolveStorage(config);
        const agent = registry.resolveAgent(config);
        const tracker = registry.resolveTracker(config);

        await storage.init();

        const orchestrator = new Orchestrator(storage, agent, tracker, config);

        const validStrategies = ['pr-per-task', 'pr-per-task-to-integration', 'local-integration'];
        if (opts.prStrategy && !validStrategies.includes(opts.prStrategy)) {
          log.error(
            `Invalid --pr-strategy "${opts.prStrategy}". Must be one of: ${validStrategies.join(', ')}`,
          );
          process.exit(1);
        }

        await orchestrator.run({
          projectPath: opts.project,
          taskIds,
          maxParallel: Number.parseInt(opts.maxParallel, 10),
          dryRun: opts.dryRun,
          retryFailed: opts.retryFailed,
          extraPrompt: opts.extraPrompt,
          prStrategy: opts.prStrategy as PrStrategy | undefined,
          integrationBranch: opts.integrationBranch,
        });

        await storage.close?.();
      },
    );
}
