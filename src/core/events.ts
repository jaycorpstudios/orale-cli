import { EventEmitter } from 'node:events';
import type { Task } from './task.js';
import type { WorktreeInfo } from './worktree.js';

export interface TaskEvent {
  taskId: string;
  timestamp: string;
}

export interface TaskStartedEvent extends TaskEvent {
  kind: 'task:started';
  task: Task;
  worktree: WorktreeInfo;
}

export interface TaskOutputEvent extends TaskEvent {
  kind: 'task:output';
  chunk: string;
  stream: 'stdout' | 'stderr';
}

export interface TaskCompletedEvent extends TaskEvent {
  kind: 'task:completed';
  task: Task;
  prUrl: string;
  durationMs: number;
}

export interface TaskFailedEvent extends TaskEvent {
  kind: 'task:failed';
  task: Task;
  error: Error;
  durationMs: number;
}

export interface PrSyncedEvent {
  kind: 'pr:synced';
  promoted: number;
  timestamp: string;
}

export type OraleEvent =
  | TaskStartedEvent
  | TaskOutputEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | PrSyncedEvent;

export class OraleEventEmitter extends EventEmitter {
  emitEvent(event: OraleEvent): boolean {
    return super.emit(event.kind, event);
  }

  onTaskStarted(listener: (data: TaskStartedEvent) => void): this {
    return this.on('task:started', listener as (data: unknown) => void);
  }

  onTaskOutput(listener: (data: TaskOutputEvent) => void): this {
    return this.on('task:output', listener as (data: unknown) => void);
  }

  onTaskCompleted(listener: (data: TaskCompletedEvent) => void): this {
    return this.on('task:completed', listener as (data: unknown) => void);
  }

  onTaskFailed(listener: (data: TaskFailedEvent) => void): this {
    return this.on('task:failed', listener as (data: unknown) => void);
  }

  onPrSynced(listener: (data: PrSyncedEvent) => void): this {
    return this.on('pr:synced', listener as (data: unknown) => void);
  }
}
