#!/usr/bin/env node
import { Command } from 'commander';
import { VERSION } from '../version.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerImportCommand } from './commands/import.js';
import { registerInitCommand } from './commands/init.js';
import { registerRunCommand } from './commands/run.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerWatchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('orale')
  .description('Plan, dispatch, and orchestrate AI coding agents across parallel git worktrees.')
  .version(VERSION);

registerInitCommand(program);
registerDoctorCommand(program);
registerRunCommand(program);
registerWatchCommand(program);
registerTasksCommand(program);
registerImportCommand(program);

// Default action: launch TUI (or show help if TUI not yet available)
program.action(async () => {
  try {
    const { launchTui } = await import('../tui/App.js');
    await launchTui();
  } catch {
    program.help();
  }
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
