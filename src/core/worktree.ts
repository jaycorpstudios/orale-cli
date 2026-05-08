import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import type { TrackerConfig } from '../config/schema.js';
import { createMutex } from '../lib/concurrency.js';
import { log } from '../lib/logger.js';
import { buildBranchName } from './branch.js';
import type { Task } from './task.js';

const withGitLock = createMutex();

export interface ResumeContext {
  commits: string;
  diffStat: string;
  uncommitted: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  resumeContext: ResumeContext | null;
}

function worktreePath(projectPath: string, taskId: string, worktreeDir: string): string {
  return join(projectPath, worktreeDir, taskId);
}

export async function detectDefaultBranch(projectPath: string): Promise<string> {
  // 1. Read the symbolic ref if already cached locally (instant, offline)
  try {
    const r = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], {
      cwd: projectPath,
    });
    const ref = r.stdout.trim();
    if (ref) return ref.replace(/^origin\//, '');
  } catch {
    // not set — fall through
  }

  // 2. Ask the remote (requires network)
  try {
    const r = await execa('git', ['remote', 'show', 'origin'], { cwd: projectPath });
    const match = r.stdout.match(/HEAD branch:\s*(\S+)/);
    if (match?.[1]) return match[1];
  } catch {
    // fall through
  }

  // 3. Check common default names
  for (const candidate of ['main', 'master', 'develop', 'trunk']) {
    try {
      const r = await execa('git', ['ls-remote', '--heads', 'origin', candidate], {
        cwd: projectPath,
      });
      if (r.stdout.trim()) return candidate;
    } catch {
      // continue
    }
  }

  throw new Error(
    'Could not detect default remote branch. ' +
      'Run `git remote set-head origin -a` in the project, or check your remote configuration.',
  );
}

async function currentBranch(wtPath: string): Promise<string> {
  const r = await execa('git', ['branch', '--show-current'], { cwd: wtPath });
  return r.stdout.trim();
}

async function localBranchExists(projectPath: string, branch: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--verify', branch], { cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function collectProgress(
  worktree: string,
  baseBranch: string,
): Promise<ResumeContext | null> {
  let commits = '';
  let diffStat = '';
  let uncommitted = '';

  try {
    const r = await execa('git', ['log', `origin/${baseBranch}..HEAD`, '--oneline'], {
      cwd: worktree,
    });
    commits = r.stdout.trim();
  } catch {
    // ignore
  }

  try {
    const r = await execa('git', ['diff', `origin/${baseBranch}...HEAD`, '--stat'], {
      cwd: worktree,
    });
    diffStat = r.stdout.trim();
  } catch {
    // ignore
  }

  try {
    const statusResult = await execa('git', ['status', '--short'], { cwd: worktree });
    const diffResult = await execa('git', ['diff', 'HEAD'], { cwd: worktree });
    uncommitted = [statusResult.stdout.trim(), diffResult.stdout.trim()].filter(Boolean).join('\n');
  } catch {
    // ignore
  }

  const hasNoMeaningfulProgress = !commits && !uncommitted;
  if (hasNoMeaningfulProgress) return null;
  return { commits, diffStat, uncommitted };
}

async function forceCleanup(projectPath: string, wtPath: string, branch: string): Promise<void> {
  await withGitLock(async () => {
    try {
      await execa('git', ['worktree', 'remove', '--force', wtPath], { cwd: projectPath });
    } catch {
      // worktree may already be gone
    }
    try {
      await execa('git', ['branch', '-D', branch], { cwd: projectPath });
    } catch {
      // branch may not exist
    }
  });
}

export async function prepareWorktree(
  projectPath: string,
  task: Task,
  trackerConfig: TrackerConfig,
  worktreeDir: string,
  branchOverride?: string,
  baseBranchOverride?: string,
): Promise<WorktreeInfo> {
  await ensureWorktreeIgnored(projectPath, worktreeDir);

  const wtPath = worktreePath(projectPath, task.id, worktreeDir);
  const targetBranch = branchOverride ?? buildBranchName(task, trackerConfig);
  const baseBranch = baseBranchOverride ?? (await detectDefaultBranch(projectPath));

  log.debug(`Detected default branch: ${baseBranch}`);

  const wtExists = await directoryExists(wtPath);
  const branchExists = await localBranchExists(projectPath, targetBranch);

  // ── Case 1: Worktree directory already exists ──────────────────────────────
  if (wtExists) {
    const branch = await currentBranch(wtPath).catch(() => targetBranch);
    const progress = await collectProgress(wtPath, baseBranch);
    const hasProgressToResume = progress !== null;

    if (hasProgressToResume) {
      const commitCount = progress.commits.split('\n').filter(Boolean).length;
      const hasUncommitted = Boolean(progress.uncommitted);
      log.info(
        `[${task.id}] Resuming existing worktree${commitCount ? ` (${commitCount} commit${commitCount !== 1 ? 's' : ''} ahead` : ''}${hasUncommitted ? ', uncommitted changes' : ''}${commitCount ? ')' : ''}`,
      );
      return { path: wtPath, branch, baseBranch, resumeContext: progress };
    }

    log.debug(`[${task.id}] Worktree has no progress — cleaning up`);
    await forceCleanup(projectPath, wtPath, branch);
  }

  // ── Case 2: Only the local branch exists (no worktree dir) ─────────────────
  if (!wtExists && branchExists) {
    try {
      await withGitLock(() =>
        execa('git', ['worktree', 'add', wtPath, targetBranch], { cwd: projectPath }),
      );
    } catch {
      log.debug(`[${task.id}] Could not recreate worktree from existing branch — cleaning up`);
      await forceCleanup(projectPath, wtPath, targetBranch);
    }

    const worktreeDirCreated = await directoryExists(wtPath);
    if (worktreeDirCreated) {
      const progress = await collectProgress(wtPath, baseBranch);
      const hasProgressToResume = progress !== null;
      if (hasProgressToResume) {
        const commitCount = progress.commits.split('\n').filter(Boolean).length;
        log.info(
          `[${task.id}] Recreated worktree from existing branch (${commitCount} commit${commitCount !== 1 ? 's' : ''} ahead) — resuming`,
        );
        return { path: wtPath, branch: targetBranch, baseBranch, resumeContext: progress };
      }
      log.debug(`[${task.id}] Existing branch has no progress — cleaning up`);
      await forceCleanup(projectPath, wtPath, targetBranch);
    }
  }

  // ── Case 3: Fresh start ─────────────────────────────────────────────────────
  // Prefer the remote ref; fall back to local if the branch hasn't been pushed yet
  // (used when baseBranchOverride points to a local integration branch).
  let startPoint = `origin/${baseBranch}`;
  try {
    await execa('git', ['rev-parse', '--verify', `origin/${baseBranch}`], { cwd: projectPath });
  } catch {
    startPoint = baseBranch;
  }

  log.debug(`[${task.id}] Creating fresh worktree from ${startPoint}`);
  await withGitLock(() =>
    execa('git', ['worktree', 'add', '-b', targetBranch, wtPath, startPoint], {
      cwd: projectPath,
    }),
  );

  return { path: wtPath, branch: targetBranch, baseBranch, resumeContext: null };
}

export async function removeWorktree(
  projectPath: string,
  taskId: string,
  worktreeDir: string,
): Promise<void> {
  const wtPath = worktreePath(projectPath, taskId, worktreeDir);
  await withGitLock(() =>
    execa('git', ['worktree', 'remove', '--force', wtPath], { cwd: projectPath }),
  );
}

async function ensureWorktreeIgnored(projectPath: string, worktreeDir: string): Promise<void> {
  const gitignorePath = join(projectPath, '.gitignore');
  const entry = `${worktreeDir}/`;

  let content = '';
  try {
    await access(gitignorePath);
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // .gitignore doesn't exist yet
  }

  if (!content.split('\n').some((line) => line.trim() === entry)) {
    const updated =
      content.endsWith('\n') || content === '' ? `${content}${entry}\n` : `${content}\n${entry}\n`;
    await writeFile(gitignorePath, updated, 'utf8');
  }
}
