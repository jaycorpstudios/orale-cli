import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { useCallback } from 'react';
import type { Task } from '../../core/task.js';
import { isTaskEligible } from '../../core/task.js';
import { useOraleStore } from '../store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function oraleCommand(): { cmd: string; args: string[] } {
  const distEntry = join(REPO_ROOT, 'dist', 'cli', 'index.js');
  if (existsSync(distEntry)) {
    return { cmd: 'node', args: [distEntry] };
  }
  return {
    cmd: 'npx',
    args: ['tsx', join(REPO_ROOT, 'src', 'cli', 'index.ts')],
  };
}

export function useRunTask() {
  const projectRoot = useOraleStore((s) => s.projectRoot);
  const startRun = useOraleStore((s) => s.startRun);
  const stopRun = useOraleStore((s) => s.stopRun);
  const appendLog = useOraleStore((s) => s.appendLog);
  const clearLog = useOraleStore((s) => s.clearLog);
  const addNotification = useOraleStore((s) => s.addNotification);
  const activeRuns = useOraleStore((s) => s.activeRuns);

  const runTask = useCallback(
    async (task: Task) => {
      const isAlreadyRunning = activeRuns.has(task.id);
      const isRunnable = isTaskEligible(task, true);

      if (!projectRoot) {
        addNotification('No project root found — run orale init', 'error');
        return;
      }

      if (isAlreadyRunning) {
        addNotification(`[${task.id}] Already running`, 'warn', task.id);
        return;
      }

      if (!isRunnable) {
        addNotification(`[${task.id}] Cannot run — status is "${task.status}"`, 'warn', task.id);
        return;
      }

      clearLog(task.id);
      startRun(task.id);
      appendLog(task.id, `▶ Starting ${task.id}: ${task.title}\n`);

      const { cmd, args } = oraleCommand();

      try {
        const proc = execa(cmd, [...args, 'run', task.id, '--project', projectRoot], {
          reject: false,
          all: false,
        });

        proc.stdout?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line) appendLog(task.id, line);
          }
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line) appendLog(task.id, `  ${line}`);
          }
        });

        const result = await proc;
        const succeeded = result.exitCode === 0;
        appendLog(
          task.id,
          succeeded
            ? `\n✓ ${task.id} completed successfully`
            : `\n✗ ${task.id} failed (exit ${result.exitCode})`,
        );

        addNotification(
          succeeded
            ? `[${task.id}] Completed — PR created`
            : `[${task.id}] Failed — press enter to view logs`,
          succeeded ? 'success' : 'error',
          task.id,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(task.id, `\n✗ Error: ${msg}`);
        addNotification(`[${task.id}] Error: ${msg}`, 'error', task.id);
      } finally {
        stopRun(task.id);
      }
    },
    [projectRoot, activeRuns, startRun, stopRun, appendLog, clearLog, addNotification],
  );

  const addressReviewComments = useCallback(
    async (task: Task) => {
      if (!projectRoot) return;
      if (activeRuns.has(task.id)) return;

      clearLog(task.id);
      startRun(task.id);
      appendLog(task.id, `▶ Addressing review comments for ${task.id}\n`);

      const { cmd, args } = oraleCommand();

      try {
        const proc = execa(
          cmd,
          [...args, 'run', task.id, '--project', projectRoot, '--address-review-comments'],
          { reject: false },
        );

        proc.stdout?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line) appendLog(task.id, line);
          }
        });

        await proc;
      } finally {
        stopRun(task.id);
      }
    },
    [projectRoot, activeRuns, startRun, stopRun, appendLog, clearLog],
  );

  const runAllTasks = useCallback(
    async (todoTasks: Task[]) => {
      if (!projectRoot || todoTasks.length === 0) return;

      const ids = todoTasks.map((t) => t.id).join(',');
      const { cmd, args } = oraleCommand();
      const logKey = '__all__';

      clearLog(logKey);
      startRun(logKey);
      appendLog(logKey, `▶ Running ${todoTasks.length} tasks: ${ids}\n`);

      try {
        const proc = execa(cmd, [...args, 'run', ids, '--project', projectRoot], {
          reject: false,
          all: false,
        });

        proc.stdout?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line) appendLog(logKey, line);
          }
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line) appendLog(logKey, `  ${line}`);
          }
        });

        const result = await proc;
        const succeeded = result.exitCode === 0;
        addNotification(
          succeeded
            ? `All ${todoTasks.length} tasks completed`
            : `Run-all failed (exit ${result.exitCode})`,
          succeeded ? 'success' : 'error',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addNotification(`Run-all error: ${msg}`, 'error');
      } finally {
        stopRun(logKey);
      }
    },
    [projectRoot, startRun, stopRun, appendLog, clearLog, addNotification],
  );

  return { runTask, addressReviewComments, runAllTasks };
}
