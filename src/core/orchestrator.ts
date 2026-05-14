import { join } from 'node:path';
import { execa } from 'execa';
import {
  buildConflictResolutionPrompt,
  buildExecutePrompt,
  buildReviewCommentsPrompt,
} from '../adapters/agent/claude-code.js';
import type { AgentAdapter } from '../adapters/agent/interface.js';
import type { StorageAdapter } from '../adapters/storage/interface.js';
import type { GitHubTrackerAdapter } from '../adapters/tracker/github.js';
import type { TrackerAdapter } from '../adapters/tracker/interface.js';
import type { PrStrategy, ResolvedConfig } from '../config/schema.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { log } from '../lib/logger.js';
import { type Batch, buildBatches } from './batch.js';
import { OraleEventEmitter } from './events.js';
import type { Task } from './task.js';
import { isTaskEligible } from './task.js';
import { detectDefaultBranch, prepareWorktree, removeWorktree } from './worktree.js';

export interface RunOptions {
  projectPath: string;
  taskIds: string[];
  maxParallel?: number;
  dryRun?: boolean;
  retryFailed?: boolean;
  extraPrompt?: string;
  prStrategy?: PrStrategy;
  integrationBranch?: string;
}

export interface WatchOptions {
  projectPath: string;
  maxParallel?: number;
  pollIntervalMs?: number;
}

export interface ReviewOptions {
  projectPath: string;
  taskIds?: string[];
  maxParallel?: number;
}

export class Orchestrator {
  readonly events = new OraleEventEmitter();

  constructor(
    private storage: StorageAdapter,
    private agent: AgentAdapter,
    private tracker: TrackerAdapter,
    private config: ResolvedConfig,
  ) {}

  async syncMergedPRs(): Promise<number> {
    const tasks = await this.storage.list({ status: ['code-review'] });
    let promoted = 0;

    for (const task of tasks) {
      if (!task.pr_url) continue;

      const state = await this.tracker.getPrState(task.pr_url);
      if (!state) continue;

      const isPrMerged = state.state === 'merged';
      const isPrClosed = state.state === 'closed';

      if (isPrMerged) {
        const mergedAt = state.mergedAt ?? new Date().toISOString();
        await this.storage.update(task.id, { status: 'done', completed_at: mergedAt });
        log.success(`[${task.id}] PR merged → done  ${task.pr_url}`);
        this.events.emitEvent({
          kind: 'pr:synced',
          promoted: 1,
          timestamp: new Date().toISOString(),
        });
        promoted++;
      } else if (isPrClosed) {
        log.warn(`[${task.id}] PR closed without merge — leaving in code-review  ${task.pr_url}`);
      }
    }

    return promoted;
  }

  async findConflictingPRs(projectPath: string): Promise<Task[]> {
    const tasks = await this.storage.list({ status: ['code-review'], project: projectPath });
    const conflicting: Task[] = [];

    for (const task of tasks) {
      if (!task.pr_url || !task.branch_name) continue;
      const state = await this.tracker.getPrState(task.pr_url);
      const isPrOpenWithConflicts = state?.state === 'open' && state.mergeable === 'conflicting';
      if (isPrOpenWithConflicts) {
        log.warn(`[${task.id}] PR has merge conflicts — queuing for resolution  ${task.pr_url}`);
        conflicting.push(task);
      }
    }

    return conflicting;
  }

  async executeTask(
    task: Task,
    projectPath: string,
    extraContext?: string,
    prStrategyOpts?: { strategy: PrStrategy; integrationBranch?: string },
  ): Promise<void> {
    const taskId = task.id;
    const startTime = Date.now();
    log.task(taskId, `Starting: ${task.title}`);

    // Run-level strategy (from CLI --pr-strategy) overrides task-level pr_strategy field.
    // Task field is only used as fallback when no run-level strategy was given.
    const effectiveStrategy: PrStrategy =
      prStrategyOpts?.strategy ?? task.pr_strategy ?? this.config.execution.prStrategy;
    const effectiveIntegrationBranch =
      prStrategyOpts?.integrationBranch ??
      task.integration_branch ??
      this.config.execution.integrationBranch;

    const isLocalIntegration = effectiveStrategy === 'local-integration';
    const baseBranchOverride =
      effectiveStrategy !== 'pr-per-task' && effectiveIntegrationBranch
        ? effectiveIntegrationBranch
        : undefined;

    await this.storage.update(taskId, {
      status: 'in-progress',
      started_at: new Date().toISOString(),
    });

    let worktreeInfo = null;
    try {
      worktreeInfo = await prepareWorktree(
        projectPath,
        task,
        this.config.tracker,
        this.config.execution.worktreeDir,
        undefined,
        baseBranchOverride,
      );
      log.task(taskId, `Worktree ready at ${worktreeInfo.path} (branch: ${worktreeInfo.branch})`);
      await this.storage.update(taskId, { branch_name: worktreeInfo.branch });

      this.events.emitEvent({
        kind: 'task:started',
        taskId,
        task,
        worktree: worktreeInfo,
        timestamp: new Date().toISOString(),
      });

      const prompt = buildExecutePrompt(
        task,
        worktreeInfo,
        this.config.tracker,
        extraContext,
        effectiveStrategy,
        effectiveIntegrationBranch,
      );
      const abortController = new AbortController();

      const result = await this.agent.execute({
        task,
        worktree: worktreeInfo,
        prompt,
        signal: abortController.signal,
        onOutput: (chunk, stream) => {
          this.events.emitEvent({
            kind: 'task:output',
            taskId,
            chunk,
            stream,
            timestamp: new Date().toISOString(),
          });
        },
        timeoutMs: this.config.agent.timeoutMs,
        noPrExpected: isLocalIntegration,
      });

      // For local-integration, status goes to code-review with no pr_url yet;
      // the orchestrator merges branches and sets pr_url to the integration PR after all batches.
      await this.storage.update(taskId, {
        status: 'code-review',
        pr_url: result.prUrl,
        completed_at: new Date().toISOString(),
        error: undefined,
      });

      await removeWorktree(projectPath, taskId, this.config.execution.worktreeDir);

      if (isLocalIntegration) {
        log.success(`[${taskId}] Done — branch pushed (will be merged to integration branch)`);
      } else {
        log.success(`[${taskId}] Done — PR: ${result.prUrl}`);
      }

      const updatedTask = await this.storage.get(taskId);
      this.events.emitEvent({
        kind: 'task:completed',
        taskId,
        task: updatedTask ?? task,
        prUrl: result.prUrl ?? '',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[${taskId}] Failed: ${message}`);

      await this.storage.update(taskId, {
        status: 'failed',
        error: message.slice(0, 500),
      });

      const updatedTask = await this.storage.get(taskId);
      this.events.emitEvent({
        kind: 'task:failed',
        taskId,
        task: updatedTask ?? task,
        error: err instanceof Error ? err : new Error(message),
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      throw err;
    }
  }

  async resolveConflict(task: Task, projectPath: string): Promise<void> {
    const taskId = task.id;
    log.task(taskId, `Resolving merge conflicts — PR: ${task.pr_url}`);

    try {
      const worktreeInfo = await prepareWorktree(
        projectPath,
        task,
        this.config.tracker,
        this.config.execution.worktreeDir,
        task.branch_name,
      );
      const prompt = buildConflictResolutionPrompt(task, worktreeInfo, this.config.tracker);
      const abortController = new AbortController();

      await this.agent.execute({
        task,
        worktree: worktreeInfo,
        prompt,
        signal: abortController.signal,
        timeoutMs: this.config.agent.timeoutMs,
      });

      await removeWorktree(projectPath, taskId, this.config.execution.worktreeDir);
      log.success(`[${taskId}] Conflicts resolved — PR updated: ${task.pr_url}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[${taskId}] Conflict resolution failed: ${message}`);
    }
  }

  async executeReviewComments(task: Task, projectPath: string): Promise<void> {
    const taskId = task.id;

    if (!task.pr_url) {
      log.warn(`[${taskId}] No PR URL — skipping`);
      return;
    }

    const threads = await this.tracker.fetchUnresolvedReviewComments(task.pr_url);

    if (threads.length === 0) {
      log.info(`[${taskId}] No active review comments — skipping`);
      return;
    }

    log.task(taskId, `${threads.length} active review thread(s) — addressing...`);

    await this.storage.update(taskId, {
      status: 'in-progress',
      started_at: new Date().toISOString(),
    });

    try {
      const worktreeInfo = await prepareWorktree(
        projectPath,
        task,
        this.config.tracker,
        this.config.execution.worktreeDir,
        task.branch_name,
      );

      const ghTracker = this.tracker as GitHubTrackerAdapter;
      const formattedComments = ghTracker.formatThreadsForPrompt(threads);
      const prompt = buildReviewCommentsPrompt(task, worktreeInfo, formattedComments);
      const abortController = new AbortController();

      const result = await this.agent.execute({
        task,
        worktree: worktreeInfo,
        prompt,
        signal: abortController.signal,
        timeoutMs: this.config.agent.timeoutMs,
      });

      await this.storage.update(taskId, {
        status: 'code-review',
        completed_at: new Date().toISOString(),
        error: undefined,
      });

      await removeWorktree(projectPath, taskId, this.config.execution.worktreeDir);
      log.success(`[${taskId}] Review comments addressed — PR: ${result.prUrl}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[${taskId}] Failed: ${message}`);
      await this.storage.update(taskId, { status: 'failed', error: message.slice(0, 500) });
      throw err;
    }
  }

  async run(options: RunOptions): Promise<void> {
    const {
      projectPath,
      taskIds,
      maxParallel = this.config.execution.maxParallel,
      dryRun = false,
      retryFailed = false,
      extraPrompt,
      prStrategy: optionStrategy,
      integrationBranch: optionIntegrationBranch,
    } = options;

    if (!dryRun) {
      const preflightResults = await Promise.all([
        this.storage.preflight(),
        this.agent.preflight(),
        this.tracker.preflight(),
      ]);

      for (const result of preflightResults) {
        if (!result.ok) {
          log.error(`Preflight failed: ${result.message}`);
          process.exit(1);
        }
      }

      log.info('Syncing merged PRs...');
      const synced = await this.syncMergedPRs();
      if (synced > 0) log.success(`${synced} task(s) promoted to done.`);

      const conflicting = await this.findConflictingPRs(projectPath);
      if (conflicting.length > 0) {
        log.info(`${conflicting.length} PR(s) have merge conflicts — resolving...`);
        for (const task of conflicting) {
          await this.resolveConflict(task, projectPath);
        }
      }
    }

    log.info(`Resolving ${taskIds.length} task(s)...`);
    const tasks: Task[] = [];

    for (const id of taskIds) {
      let task = await this.storage.get(id);
      if (!task) {
        log.error(`Task not found: ${id}`);
        process.exit(1);
      }

      if (!dryRun) {
        const isEligible = isTaskEligible(task, retryFailed);
        if (!isEligible) {
          const hint = task.status === 'failed' ? ' — use --retry-failed to re-execute it' : '';
          log.error(`Task ${id} has status "${task.status}"${hint} — skipping`);
          continue;
        }

        const shouldResetFailedStatus = retryFailed && task.status === 'failed';
        if (shouldResetFailedStatus) {
          log.task(id, 'Resetting status: failed → todo');
          task = await this.storage.update(id, { status: 'todo', error: undefined });
        }
      }

      tasks.push(task);
    }

    if (tasks.length === 0) {
      log.warn('No eligible tasks to run.');
      return;
    }

    // Resolve external dependencies
    const taskIdSet = new Set(tasks.map((t) => t.id));
    const externalDeps = new Set<string>();
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (!taskIdSet.has(dep)) externalDeps.add(dep);
      }
    }

    const preResolved = new Set<string>();
    for (const depId of externalDeps) {
      const depTask = await this.storage.get(depId);
      if (!depTask) {
        log.error(`Dependency "${depId}" not found — cannot verify it is done`);
        process.exit(1);
      }
      if (depTask.status !== 'done') {
        log.error(`Dependency "${depId}" (status: ${depTask.status}) is not yet done`);
        process.exit(1);
      }
      log.info(`Dependency "${depId}" is done — treating as pre-resolved`);
      preResolved.add(depId);
    }

    let batches: Batch[];
    try {
      batches = buildBatches(tasks, preResolved);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    log.info(`Batch plan (${batches.length} batch${batches.length !== 1 ? 'es' : ''}):`);
    for (const batch of batches) {
      const ids = batch.tasks.map((t) => t.id).join(', ');
      log.info(`  Batch ${batch.batchNumber}: ${ids}`);
    }

    if (dryRun) {
      log.info('Dry run complete — no tasks executed.');
      return;
    }

    // ── Resolve effective PR strategy ─────────────────────────────────────────
    // Priority: CLI run option → config default (task-level pr_strategy is applied per-task in executeTask)
    const effectiveStrategy: PrStrategy = optionStrategy ?? this.config.execution.prStrategy;
    const effectiveIntegrationBranch =
      optionIntegrationBranch ?? this.config.execution.integrationBranch;

    if (effectiveStrategy !== 'pr-per-task') {
      if (!effectiveIntegrationBranch) {
        log.error(
          `PR strategy "${effectiveStrategy}" requires an integration branch. Set it with --integration-branch or in config.`,
        );
        process.exit(1);
      }
      const mainBranch =
        this.config.execution.mainBranch ?? (await detectDefaultBranch(projectPath));

      const isIntegrationSameAsMain = effectiveIntegrationBranch === mainBranch;
      if (isIntegrationSameAsMain) {
        log.error(
          `Integration branch cannot be the same as main branch ("${mainBranch}"). Use a different branch name.`,
        );
        process.exit(1);
      }

      await this.ensureIntegrationBranch(effectiveIntegrationBranch, mainBranch, projectPath);
      log.info(
        `Integration branch: ${effectiveIntegrationBranch} (strategy: ${effectiveStrategy})`,
      );

      const isMultiBatch = batches.length > 1;
      const isPrPerTaskToIntegration = effectiveStrategy === 'pr-per-task-to-integration';
      if (isPrPerTaskToIntegration && isMultiBatch) {
        log.warn(
          `Strategy "pr-per-task-to-integration" with ${batches.length} batches requires manual PR merging between batches. ` +
            `Batch 2+ tasks target the integration branch without previous batch PRs merged. ` +
            `Consider "local-integration" for automatic dependency handling.`,
        );
      }
    }

    const prStrategyOpts =
      effectiveStrategy !== 'pr-per-task'
        ? { strategy: effectiveStrategy, integrationBranch: effectiveIntegrationBranch }
        : undefined;

    const failed = new Set<string>();
    const localIntegrationTaskIds: string[] = [];

    for (const batch of batches) {
      const runnable = batch.tasks.filter((t) => {
        const failedDependency = t.dependencies.find((dep) => failed.has(dep));
        const hasFailedDependency = failedDependency !== undefined;
        if (hasFailedDependency) {
          log.warn(`[${t.id}] Skipped — dependency ${failedDependency} failed`);
          return false;
        }
        return true;
      });

      if (runnable.length === 0) continue;

      log.info(
        `--- Batch ${batch.batchNumber} (${runnable.length} task${runnable.length !== 1 ? 's' : ''}) ---`,
      );

      const results = await runWithConcurrency(runnable, maxParallel, (task) =>
        this.executeTask(task, projectPath, extraPrompt, prStrategyOpts),
      );

      const batchLocalIds: string[] = [];
      for (const [task, ok] of results) {
        if (!ok) {
          failed.add(task.id);
        } else if (effectiveStrategy === 'local-integration') {
          batchLocalIds.push(task.id);
          localIntegrationTaskIds.push(task.id);
        }
      }

      if (failed.size > 0) break; // Stop processing batches if any task failed

      // For local-integration: merge this batch's branches into the integration branch
      // before starting the next batch so dependent tasks start from the updated state.
      const hasLocalBranches = batchLocalIds.length > 0;
      if (effectiveStrategy === 'local-integration' && hasLocalBranches) {
        const batchBranches = await this.collectBranchesFromIds(batchLocalIds);
        if (batchBranches.length > 0) {
          log.info(
            `Merging batch ${batch.batchNumber} (${batchBranches.length} branch(es)) into ${effectiveIntegrationBranch}...`,
          );
          await this.mergeToIntegration(batchBranches, effectiveIntegrationBranch!, projectPath);
          log.success(`Batch ${batch.batchNumber} merged — integration branch updated`);
        }
      }
    }

    if (failed.size > 0) {
      log.error(`${failed.size} task(s) failed: ${[...failed].join(', ')}`);
      process.exit(1);
    }

    // ── Local-integration post-processing ────────────────────────────────────
    // Branches are already merged incrementally after each batch; only open the final PR.
    if (effectiveStrategy === 'local-integration' && localIntegrationTaskIds.length > 0) {
      const mainBranch =
        this.config.execution.mainBranch ?? (await detectDefaultBranch(projectPath));

      const featureTitle = tasks[0]?.feature || 'Integration';
      log.info(`Opening integration PR: ${effectiveIntegrationBranch} → ${mainBranch}`);
      const integrationPrUrl = await this.openIntegrationPR(
        effectiveIntegrationBranch!,
        mainBranch,
        projectPath,
        featureTitle,
      );

      for (const id of localIntegrationTaskIds) {
        const updated = await this.storage.get(id);
        if (updated?.status === 'code-review') {
          await this.storage.update(id, { pr_url: integrationPrUrl });
        }
      }

      log.success(`Integration PR: ${integrationPrUrl}`);
    }

    log.info('Checking for merged PRs...');
    const promoted = await this.syncMergedPRs();
    if (promoted > 0) log.success(`${promoted} task(s) promoted to done.`);

    log.success('All tasks completed successfully.');
  }

  private async collectBranchesFromIds(
    taskIds: string[],
  ): Promise<Array<{ taskId: string; branch: string }>> {
    const branches: Array<{ taskId: string; branch: string }> = [];
    for (const id of taskIds) {
      const task = await this.storage.get(id);
      if (task?.branch_name) {
        branches.push({ taskId: id, branch: task.branch_name });
      }
    }
    return branches;
  }

  private async remoteBranchExists(branch: string, projectPath: string): Promise<boolean> {
    try {
      await execa('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], {
        cwd: projectPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureIntegrationBranch(
    integrationBranch: string,
    mainBranch: string,
    projectPath: string,
  ): Promise<void> {
    const existsOnRemote = await this.remoteBranchExists(integrationBranch, projectPath);

    if (existsOnRemote) {
      log.info(`Integration branch "${integrationBranch}" already exists on remote`);
      // Ensure a local tracking branch exists
      try {
        await execa('git', ['rev-parse', '--verify', integrationBranch], { cwd: projectPath });
      } catch {
        await execa(
          'git',
          ['branch', '--track', integrationBranch, `origin/${integrationBranch}`],
          { cwd: projectPath },
        );
        log.info(`Set up local tracking branch for "${integrationBranch}"`);
      }
      return;
    }

    // Remote doesn't exist — ensure local branch exists
    try {
      await execa('git', ['rev-parse', '--verify', integrationBranch], { cwd: projectPath });
      log.info(`Integration branch "${integrationBranch}" exists locally — pushing to remote`);
    } catch {
      // Doesn't exist locally either — create from origin/main or main
      try {
        await execa('git', ['branch', integrationBranch, `origin/${mainBranch}`], {
          cwd: projectPath,
        });
      } catch {
        await execa('git', ['branch', integrationBranch, mainBranch], { cwd: projectPath });
      }
      log.success(`Created integration branch "${integrationBranch}" from ${mainBranch}`);
    }

    // Push to remote and set upstream tracking
    await execa('git', ['push', '-u', 'origin', integrationBranch], { cwd: projectPath });
    log.success(`Pushed integration branch "${integrationBranch}" to remote`);
  }

  private async mergeToIntegration(
    branches: Array<{ taskId: string; branch: string }>,
    integrationBranch: string,
    projectPath: string,
  ): Promise<void> {
    const integWtPath = join(projectPath, this.config.execution.worktreeDir, '__integration__');

    await execa('git', ['worktree', 'add', integWtPath, integrationBranch], { cwd: projectPath });

    try {
      for (const { taskId, branch } of branches) {
        log.info(`[${taskId}] Merging ${branch} → ${integrationBranch}`);
        await execa('git', ['merge', '--no-ff', '--no-edit', branch], { cwd: integWtPath });
      }
      await execa('git', ['push', 'origin', integrationBranch], { cwd: integWtPath });
    } finally {
      await execa('git', ['worktree', 'remove', '--force', integWtPath], { cwd: projectPath });
    }
  }

  private async openIntegrationPR(
    integrationBranch: string,
    mainBranch: string,
    projectPath: string,
    featureTitle: string,
  ): Promise<string> {
    const ghPath = this.config.tracker.ghPath;
    const result = await execa(
      ghPath,
      [
        'pr',
        'create',
        '--head',
        integrationBranch,
        '--base',
        mainBranch,
        '--title',
        featureTitle,
        '--body',
        `Integration branch for: ${featureTitle}\n\nContains changes from multiple tasks.`,
      ],
      { cwd: projectPath },
    );
    const url = result.stdout.trim();
    const isValidPrUrl = url.startsWith('http');
    if (!isValidPrUrl) {
      throw new Error(`gh pr create did not return a URL: ${url}`);
    }
    return url;
  }
}
