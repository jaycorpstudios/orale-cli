// Public programmatic API
export type { Task, TaskStatus, NewTask } from './core/task.js';
export { TaskSchema, TaskStatusSchema } from './core/task.js';
export type {
  StorageAdapter,
  StorageCapabilities,
  TaskFilter,
  TaskEvent,
} from './adapters/storage/interface.js';
export type { AgentAdapter, AgentExecution, AgentResult } from './adapters/agent/interface.js';
export type { TrackerAdapter, PrStatus, ReviewThread } from './adapters/tracker/interface.js';
export { Orchestrator } from './core/orchestrator.js';
export { buildBatches, type Batch } from './core/batch.js';
export { buildBranchName } from './core/branch.js';
export {
  prepareWorktree,
  removeWorktree,
  type WorktreeInfo,
  type ResumeContext,
} from './core/worktree.js';
export { loadConfig } from './config/loader.js';
export type { ResolvedConfig, ProjectConfig, GlobalConfig } from './config/schema.js';

// Built-in adapters
export { ObsidianStorageAdapter } from './adapters/storage/obsidian.js';
export { LocalJsonStorageAdapter } from './adapters/storage/local-json.js';
export { LocalSqliteStorageAdapter } from './adapters/storage/local-sqlite.js';
export { ClaudeCodeAgentAdapter } from './adapters/agent/claude-code.js';
export { GitHubTrackerAdapter } from './adapters/tracker/github.js';

// Registry
export { AdapterRegistry, createDefaultRegistry } from './adapters/registry.js';
