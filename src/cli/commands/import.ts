import type { Command } from 'commander';
import { createDefaultRegistry } from '../../adapters/registry.js';
import { ObsidianStorageAdapter } from '../../adapters/storage/obsidian.js';
import { loadConfig } from '../../config/loader.js';
import { log } from '../../lib/logger.js';

export function registerImportCommand(program: Command): void {
  const importCmd = program.command('import').description('Import tasks from an external source');

  importCmd
    .command('obsidian')
    .description('Import tasks from an Obsidian vault into the configured storage adapter')
    .option('--project <path>', 'Project root (for config loading)')
    .option('--vault <name>', 'Obsidian vault name (overrides config)', 'task-management')
    .option('--feature <feature>', 'Only import tasks from this feature/folder')
    .action(async (opts: { project?: string; vault: string; feature?: string }) => {
      const { config } = await loadConfig(opts.project);

      const obsidianConfig = {
        ...config,
        storage: {
          ...config.storage,
          obsidian: {
            vault: opts.vault,
            cli: config.storage.obsidian?.cli ?? 'obsidian-cli',
          },
        },
      };

      const source = new ObsidianStorageAdapter(obsidianConfig);
      const preflightResult = await source.preflight();
      if (!preflightResult.ok) {
        log.error(`Obsidian not reachable: ${preflightResult.message}`);
        process.exit(1);
      }

      const registry = await createDefaultRegistry(config);
      const target = registry.resolveStorage(config);
      await target.init();

      log.info(`Importing from Obsidian vault "${opts.vault}"...`);
      const tasks = await source.list(opts.feature ? { feature: opts.feature } : undefined);

      log.info(`Found ${tasks.length} task(s) to import.`);

      let imported = 0;
      let skipped = 0;

      for (const task of tasks) {
        try {
          const existing = await target.get(task.id);
          if (existing) {
            log.info(`[${task.id}] Already exists — skipping`);
            skipped++;
            continue;
          }
          await target.create(task);
          log.success(`[${task.id}] Imported: ${task.title}`);
          imported++;
        } catch (err) {
          log.error(`[${task.id}] Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await target.close?.();

      log.success(`\nImport complete: ${imported} imported, ${skipped} skipped (already existed).`);
    });
}
