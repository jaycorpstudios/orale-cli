import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import { globalPaths, projectPaths } from '../../config/paths.js';
import type { ProjectConfig } from '../../config/schema.js';
import { detectDefaultBranch } from '../../core/worktree.js';
import { log } from '../../lib/logger.js';
import { getAvailableVersion, getInstalledVersion, installer } from '../../skills/installer.js';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

async function ensureGlobalConfig(): Promise<void> {
  await mkdir(join(globalPaths.config, '..'), { recursive: true });
  try {
    await access(globalPaths.config);
  } catch {
    const globalConfig = {
      defaultStorage: 'local-sqlite',
      defaultAgent: 'claude-code',
      defaultTracker: 'github',
    };
    await writeFile(globalPaths.config, JSON.stringify(globalConfig, null, 2));
    log.success(`Created global config at ${globalPaths.config}`);
  }
}

async function ensureProjectConfig(projectRoot: string, config: ProjectConfig): Promise<void> {
  const paths = projectPaths(projectRoot);
  await mkdir(paths.oraleDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const configPath = paths.config;
  try {
    await access(configPath);
    log.info(`Project config already exists at ${configPath}`);
  } catch {
    await writeFile(configPath, JSON.stringify(config, null, 2));
    log.success(`Created project config at ${configPath}`);
  }
}

async function ensureGitignore(projectRoot: string, entries: string[]): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore');
  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // .gitignore doesn't exist yet
  }

  const lines = content.split('\n');
  const missing = entries.filter((e) => !lines.some((l) => l.trim() === e));

  if (missing.length > 0) {
    const updated =
      content.endsWith('\n') || content === ''
        ? `${content}${missing.join('\n')}\n`
        : `${content}\n${missing.join('\n')}\n`;
    await writeFile(gitignorePath, updated);
    log.success(`Added to .gitignore: ${missing.join(', ')}`);
  }
}

async function installSkills(projectRoot: string, global_: boolean): Promise<void> {
  const paths = projectPaths(projectRoot);
  const skillsDir = global_ ? globalPaths.skillsRoot : join(projectRoot, '.claude', 'skills');
  const versionFilePath = global_ ? globalPaths.skillsVersion : paths.skillsVersion;

  const [installedVersion, availableVersion] = await Promise.all([
    getInstalledVersion(versionFilePath),
    getAvailableVersion(),
  ]);

  const isAlreadyUpToDate = installedVersion === availableVersion;
  if (isAlreadyUpToDate) {
    log.info(`orale skills already up to date (v${installedVersion})`);
    return;
  }

  await installer(skillsDir, versionFilePath);

  const isUpgrade = installedVersion !== null;
  if (isUpgrade) {
    log.success(`Updated orale skills: v${installedVersion} → v${availableVersion}`);
  } else {
    log.success(`Installed orale skills v${availableVersion} to ${skillsDir}`);
  }
  log.info('Commands available: /orale:plan, /orale:tasks, /orale:review');
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Set up orale in the current project')
    .option('--project <path>', 'Project root directory', cwd())
    .option(
      '--storage <adapter>',
      'Storage adapter (local-sqlite, obsidian, linear)',
      'local-sqlite',
    )
    .option('--agent <adapter>', 'Agent adapter (claude-code, aider)', 'claude-code')
    .option('--tracker <adapter>', 'Tracker adapter (github, none)', 'github')
    .option('--no-skills', 'Skip installing Claude Code skills')
    .option(
      '--global',
      'Install skills globally (~/.claude/skills/orale/) instead of project-local',
    )
    .action(
      async (opts: {
        project: string;
        storage: string;
        agent: string;
        tracker: string;
        skills: boolean;
        global: boolean;
      }) => {
        const projectRoot = opts.project;

        console.log(`\n${BOLD}orale init${RESET} — setting up in ${projectRoot}\n`);

        await ensureGlobalConfig();

        type StorageAdapter = 'local-sqlite' | 'local-json' | 'obsidian' | 'linear' | 'jira';
        type AgentAdapter = 'claude-code' | 'aider' | 'codex';
        type TrackerAdapter = 'github' | 'gitlab' | 'none';

        // ── Interactive prompts (skip when stdin is not a TTY) ──────────────
        let detectedMainBranch: string | undefined;
        let chosenPrStrategy: 'pr-per-task' | 'pr-per-task-to-integration' | 'local-integration' =
          'pr-per-task';

        const isInteractive = process.stdin.isTTY;
        if (isInteractive) {
          clack.intro(`${BOLD}orale${RESET} — project setup`);

          try {
            detectedMainBranch = await detectDefaultBranch(projectRoot);
          } catch {
            // git not available or no remote — skip
          }

          const mainBranchAnswer = await clack.text({
            message: 'Main branch:',
            placeholder: detectedMainBranch ?? 'main',
            defaultValue: detectedMainBranch ?? 'main',
          });
          if (clack.isCancel(mainBranchAnswer)) {
            clack.cancel('Cancelled.');
            process.exit(0);
          }
          detectedMainBranch = mainBranchAnswer as string;

          const strategyAnswer = await clack.select({
            message: 'Default PR strategy:',
            options: [
              {
                value: 'pr-per-task',
                label: 'PR per task → main branch (default)',
                hint: 'best for small features',
              },
              {
                value: 'pr-per-task-to-integration',
                label: 'PR per task → integration branch',
                hint: 'team reviews each PR, then merges via integration branch',
              },
              {
                value: 'local-integration',
                label: 'Local integration branch — one final PR',
                hint: 'best for large features; one PR with all changes',
              },
            ],
          });
          if (clack.isCancel(strategyAnswer)) {
            clack.cancel('Cancelled.');
            process.exit(0);
          }
          chosenPrStrategy = strategyAnswer as typeof chosenPrStrategy;

          clack.outro('Config ready');
        }

        const projectConfig: ProjectConfig = {
          version: 1,
          storage: {
            adapter: opts.storage as StorageAdapter,
          },
          agent: {
            adapter: opts.agent as AgentAdapter,
          },
          tracker: {
            adapter: opts.tracker as TrackerAdapter,
          },
          execution: {
            maxParallel: 3,
            worktreeDir: '.worktrees',
            preserveOnFailure: true,
            ...(detectedMainBranch ? { mainBranch: detectedMainBranch } : {}),
            prStrategy: chosenPrStrategy,
          },
        };

        await ensureProjectConfig(projectRoot, projectConfig);

        await ensureGitignore(projectRoot, ['.orale/config.local.json', '.worktrees/']);

        if (opts.skills) {
          try {
            await installSkills(projectRoot, opts.global);
          } catch (err) {
            log.warn(
              `Could not install skills: ${err instanceof Error ? err.message : String(err)}`,
            );
            log.warn('You can install them later by re-running: orale init');
          }
        }

        console.log(`\n${GREEN}${BOLD}✓ orale is ready!${RESET}\n`);
        console.log('Next steps:');
        console.log('  1. In a Claude session: /orale:plan — plan a feature');
        console.log('  2.                      /orale:tasks — convert plan to tasks');
        console.log('  3. In your terminal:    orale — open the kanban TUI');
        console.log('  4. Or directly:         orale run AUTH-001,AUTH-002\n');
      },
    );
}
