import { execa } from 'execa';
import type { PrStrategy, ResolvedConfig } from '../../config/schema.js';
import { AgentTimeoutError } from '../../core/errors.js';
import type { Task } from '../../core/task.js';
import type { WorktreeInfo } from '../../core/worktree.js';
import type { PreflightResult } from '../storage/interface.js';
import type { AgentAdapter, AgentExecution, AgentResult } from './interface.js';

export function buildExecutePrompt(
  task: Task,
  worktreeInfo: WorktreeInfo,
  trackerConfig: ResolvedConfig['tracker'],
  extraContext?: string,
  prStrategy?: PrStrategy,
  integrationBranch?: string,
): string {
  const { branch, baseBranch, resumeContext } = worktreeInfo;
  const existingPrUrl = task.pr_url ?? '';
  const effectiveStrategy = prStrategy ?? 'pr-per-task';

  const resumeSection = resumeContext
    ? `
## RESUMING A PREVIOUS ATTEMPT

Work on this task was already started. Review what exists before proceeding.

### Commits already on the branch
${resumeContext.commits || '(none)'}

### Files already modified (diff stat)
${resumeContext.diffStat || '(none)'}

### Uncommitted changes in the worktree
${resumeContext.uncommitted || '(none)'}

Assess the existing work and decide:
- If the implementation is **correct and complete**: stage any uncommitted changes, commit, and push.
- If the implementation is **incomplete**: finish the remaining work, then commit and push.
- If there are **errors or issues** with what was done: fix them first, then proceed.

`
    : '';

  const ghPath = trackerConfig.ghPath;
  const prBase =
    effectiveStrategy === 'pr-per-task-to-integration' && integrationBranch
      ? integrationBranch
      : baseBranch;

  let pushStep: string;
  if (effectiveStrategy === 'local-integration') {
    pushStep = `4. **Push the branch** (no pull request needed — changes will be merged to the integration branch):
   git push origin ${branch}

   Output the branch name on a line by itself in exactly this format when done:
   BRANCH_PUSHED: ${branch}`;
  } else if (existingPrUrl) {
    pushStep = `4. **Push the branch** (force — rebase rewrote history):
   git push --force-with-lease origin ${branch}
   The push MUST succeed. If it fails, diagnose and fix before continuing.

5. **The PR already exists — do NOT run \`gh pr create\`.**
   It auto-updates from the push above. Confirm the push succeeded by running:
   ${ghPath} pr view --head ${branch} --json url --jq '.url'
   Output the result on a line by itself in exactly this format:
   PR_URL: <url>`;
  } else {
    pushStep = `4. **Push the branch**:
   git push origin ${branch}

5. **Create a pull request**:
   ${ghPath} pr create --head ${branch} --base ${prBase}

The PR must include:
- A concise title describing the change
- Summary section (what was done and why)
- Files modified section
- Review guide (where to start, what to focus on)

When the PR is created, output its URL on a line by itself in exactly this format:
PR_URL: <url>`;
  }

  return `You are implementing task ${task.id}: ${task.title}

Project: ${task.project}
Branch: ${branch}
Files to modify: ${task.files_to_modify.length ? task.files_to_modify.join(', ') : '(see instructions)'}
${resumeSection}
${task.body}

---

After completing the implementation, follow these steps IN ORDER:

1. **Fetch latest changes** to avoid upstream divergence issues:
   git fetch origin

2. **Rebase on the latest base branch** to incorporate any new commits:
   git rebase origin/${baseBranch}
   If there are conflicts, resolve them before proceeding.

3. **Stage and commit** all changes with a clear, descriptive commit message.

${pushStep}

IMPORTANT CONSTRAINTS:
- Do NOT mention Claude, AI, or any AI/automation tools anywhere in: PR titles, PR bodies, commit messages, or code comments
- The PR should read as if written by a human developer
- NEVER use --no-verify or --no-gpg-sign to bypass git hooks. If a pre-commit or pre-push hook fails, investigate and fix the underlying issue (lint errors, type errors, test failures) before retrying.
${extraContext ? `\n## Additional Context\n\n${extraContext}\n` : ''}`;
}

export function buildConflictResolutionPrompt(
  task: Task,
  worktreeInfo: WorktreeInfo,
  trackerConfig: ResolvedConfig['tracker'],
): string {
  const { branch, baseBranch } = worktreeInfo;
  const ghPath = trackerConfig.ghPath;

  return `You are resolving merge conflicts for task ${task.id}: ${task.title}

Project: ${task.project}
Branch: ${branch}
Existing PR: ${task.pr_url}

This PR has merge conflicts with the base branch. Your job is to resolve them and force-push so the PR auto-updates.

Follow these steps IN ORDER:

1. **Fetch latest changes**:
   git fetch origin

2. **Rebase onto the latest base branch**:
   git rebase origin/${baseBranch}

   Conflicts will appear. For each conflicting file:
   - Understand what both sides changed
   - Keep BOTH changes where they don't conflict semantically
   - Prioritise this task's changes when they genuinely conflict
   - Stage each resolved file: git add <file>
   - Continue: git rebase --continue

3. **Force-push** (intentional — rebase rewrites history on a feature branch):
   git push --force-with-lease origin ${branch}

4. Verify the push succeeded.

When done, output the existing PR URL on a line by itself in exactly this format:
PR_URL: ${task.pr_url}

IMPORTANT:
- Do NOT create a new PR — the existing one (${task.pr_url}) auto-updates on force-push
- NEVER use --no-verify or --no-gpg-sign
- The branch should have exactly 1 commit after the rebase
`;
}

export function buildReviewCommentsPrompt(
  task: Task,
  worktreeInfo: WorktreeInfo,
  formattedComments: string,
): string {
  const { branch, baseBranch } = worktreeInfo;

  return `You are addressing GitHub PR review comments for task ${task.id}: ${task.title}

Project: ${task.project}
Branch: ${branch}
Base branch: ${baseBranch}
PR: ${task.pr_url}

## Active Review Comments

${formattedComments}

## Instructions

1. Fetch the latest remote state:
   git fetch origin

2. Read each review comment thread carefully. For each one, locate the relevant file and line, then make exactly the change being requested.

3. Only address what the comments explicitly ask for. Do not refactor unrelated code or add new features.

4. After addressing ALL comments:

   a. Stage your changes:
      git add -A

   b. Ensure exactly one commit on the branch (amend if there is already one, squash if there are more):
      MERGE_BASE=$(git merge-base HEAD origin/${baseBranch})
      COMMIT_COUNT=$(git rev-list "$MERGE_BASE"..HEAD | wc -l | tr -d ' ')
      if [ "$COMMIT_COUNT" -gt "1" ]; then
        ORIGINAL_MSG=$(git log --format=%B "$(git rev-list --reverse "$MERGE_BASE"..HEAD | head -1)")
        git reset --soft "$MERGE_BASE"
        git commit -m "$ORIGINAL_MSG"
      else
        git commit --amend --no-edit
      fi

   c. Force-push:
      git push --force-with-lease origin ${branch}

5. Verify the push succeeded, then output the PR URL in exactly this format:
   PR_URL: ${task.pr_url}

IMPORTANT CONSTRAINTS:
- Do NOT create a new PR — the existing one auto-updates on force-push
- The branch must have exactly 1 commit after the push
- Do NOT mention Claude or AI in commit messages
- NEVER use --no-verify or --no-gpg-sign
`;
}

async function findPrForBranch(
  branch: string,
  cwd: string,
  ghPath: string,
): Promise<string | null> {
  try {
    const result = await execa(
      ghPath,
      ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url'],
      { cwd },
    );
    const url = result.stdout.trim();
    return url.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}

export class ClaudeCodeAgentAdapter implements AgentAdapter {
  readonly name = 'claude-code';
  private config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  async preflight(): Promise<PreflightResult> {
    try {
      await execa('claude', ['--version']);
      return { ok: true, message: 'Claude Code CLI is available' };
    } catch {
      return {
        ok: false,
        message:
          'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
      };
    }
  }

  async execute(input: AgentExecution): Promise<AgentResult> {
    const { task, worktree, prompt, signal, onOutput, timeoutMs, noPrExpected } = input;
    const ghPath = this.config.tracker.ghPath;
    const model = this.config.agent.model;
    const permissionMode = this.config.agent.permissionMode;

    const startTime = Date.now();
    let stdout = '';
    let timedOut = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Forward external abort signal
    signal.addEventListener('abort', () => controller.abort());

    try {
      const proc = execa(
        'claude',
        ['--print', '--model', model, '--permission-mode', permissionMode, prompt],
        {
          cwd: worktree.path,
          cancelSignal: controller.signal,
          all: false,
          reject: false,
        },
      );

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        onOutput?.(text, 'stdout');
        process.stdout.write(chunk);
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        onOutput?.(text, 'stderr');
      });

      const result = await proc;
      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      // BRANCH_PUSHED in stdout → success for local-integration mode
      if (noPrExpected) {
        if (timedOut || signal.aborted) throw new AgentTimeoutError(task.id, timeoutMs);
        if (result.exitCode !== 0) {
          throw new Error(`Claude exited with code ${result.exitCode ?? 'unknown'}`);
        }
        return { prUrl: undefined, exitCode: result.exitCode ?? 0, output: stdout, durationMs };
      }

      // PR_URL in stdout → success
      const match = stdout.match(/PR_URL:\s*(https?:\/\/\S+)/);
      if (match) {
        return { prUrl: match[1], exitCode: result.exitCode ?? 0, output: stdout, durationMs };
      }

      if (timedOut || signal.aborted) {
        // Fallback: check gh if no prior PR (might have pushed before kill)
        if (!task.pr_url) {
          const prUrl = await findPrForBranch(worktree.branch, worktree.path, ghPath);
          if (prUrl) {
            return { prUrl, exitCode: 0, output: stdout, durationMs };
          }
        }
        throw new AgentTimeoutError(task.id, timeoutMs);
      }

      if (result.exitCode !== 0) {
        throw new Error(`Claude exited with code ${result.exitCode ?? 'unknown'}`);
      }

      // Clean exit but no PR_URL sentinel — gh fallback only when no prior PR
      if (!task.pr_url) {
        const prUrl = await findPrForBranch(worktree.branch, worktree.path, ghPath);
        if (prUrl) {
          return { prUrl, exitCode: 0, output: stdout, durationMs };
        }
      }

      throw new Error('No PR_URL found in Claude output');
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}
