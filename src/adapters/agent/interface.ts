import type { Task } from '../../core/task.js';
import type { WorktreeInfo } from '../../core/worktree.js';
import type { PreflightResult } from '../storage/interface.js';

export interface AgentExecution {
  task: Task;
  worktree: WorktreeInfo;
  prompt: string;
  signal: AbortSignal;
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  timeoutMs: number;
  env?: Record<string, string>;
  noPrExpected?: boolean;
}

export interface AgentResult {
  prUrl?: string;
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface AgentAdapter {
  readonly name: string;
  preflight(): Promise<PreflightResult>;
  execute(input: AgentExecution): Promise<AgentResult>;
}
