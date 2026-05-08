import { cwd } from 'node:process';
import type { Command } from 'commander';
import { execa } from 'execa';
import { projectPaths } from '../../config/paths.js';
import { getAvailableVersion, getInstalledVersion } from '../../skills/installer.js';

interface Check {
  name: string;
  description: string;
  check: () => Promise<{ ok: boolean; detail: string }>;
}

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

async function checkCommand(cmd: string, args: string[]): Promise<{ ok: boolean; detail: string }> {
  try {
    const result = await execa(cmd, args);
    return { ok: true, detail: result.stdout.trim().split('\n')[0] };
  } catch {
    return { ok: false, detail: 'Not found or not in PATH' };
  }
}

const CHECKS: Check[] = [
  {
    name: 'Node.js ≥ 20',
    description: 'Required runtime',
    check: async () => {
      const version = process.version;
      const major = Number.parseInt(version.slice(1).split('.')[0], 10);
      return {
        ok: major >= 20,
        detail: version,
      };
    },
  },
  {
    name: 'git',
    description: 'Required for worktree management',
    check: () => checkCommand('git', ['--version']),
  },
  {
    name: 'gh (GitHub CLI)',
    description: 'Required for PR creation and review comments',
    check: () => checkCommand('gh', ['--version']),
  },
  {
    name: 'gh auth',
    description: 'GitHub CLI must be authenticated',
    check: async () => {
      try {
        const result = await execa('gh', ['auth', 'status']);
        const output = (result.stdout + result.stderr).trim();
        const isAuthed = output.includes('Logged in to') || output.includes('github.com');
        return {
          ok: isAuthed,
          detail: isAuthed ? 'Authenticated' : 'Not authenticated — run: gh auth login',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, detail: `Not authenticated: ${msg}` };
      }
    },
  },
  {
    name: 'claude (Claude Code CLI)',
    description: 'Required for AI agent execution',
    check: () => checkCommand('claude', ['--version']),
  },
  {
    name: 'orale skills',
    description: 'Claude Code skills installed by orale init',
    check: async () => {
      const { skillsVersion } = projectPaths(cwd());
      const [installed, available] = await Promise.all([
        getInstalledVersion(skillsVersion),
        getAvailableVersion(),
      ]);
      if (!installed) {
        return { ok: false, detail: 'Not installed — run: orale init' };
      }
      const isUpToDate = installed === available;
      return {
        ok: isUpToDate,
        detail: isUpToDate
          ? `v${installed}`
          : `v${installed} installed, v${available} available — run: orale init`,
      };
    },
  },
  {
    name: 'obsidian-cli',
    description: 'Optional — required only if using Obsidian storage adapter',
    check: async () => {
      try {
        await execa('obsidian-cli', ['--version']);
        return { ok: true, detail: 'Available' };
      } catch {
        return { ok: true, detail: '(Not installed — optional)' };
      }
    },
  },
];

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check that all required tools are installed and configured')
    .action(async () => {
      console.log(`\n${BOLD}orale doctor${RESET} — environment check\n`);

      let allOk = true;
      const warnings: string[] = [];

      for (const check of CHECKS) {
        const result = await check.check();
        const icon = result.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        const status = result.ok
          ? `${GREEN}${result.detail}${RESET}`
          : `${RED}${result.detail}${RESET}`;

        console.log(`  ${icon}  ${BOLD}${check.name}${RESET}`);
        console.log(`     ${YELLOW}${check.description}${RESET}`);
        console.log(`     ${status}\n`);

        if (
          !result.ok &&
          !check.name.includes('Optional') &&
          !check.description.includes('Optional')
        ) {
          allOk = false;
        }
      }

      if (allOk) {
        console.log(`${GREEN}${BOLD}✓ All checks passed. orale is ready to use.${RESET}\n`);
      } else {
        console.log(
          `${RED}${BOLD}✗ Some checks failed. Fix the issues above before using orale.${RESET}\n`,
        );
        process.exit(1);
      }
    });
}
