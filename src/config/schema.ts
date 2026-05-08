import { z } from 'zod';

const StorageConfigSchema = z.object({
  adapter: z
    .enum(['local-sqlite', 'local-json', 'obsidian', 'linear', 'jira'])
    .default('local-sqlite'),
  path: z.string().optional(),
  obsidian: z
    .object({
      vault: z.string().default('task-management'),
      cli: z.string().default('obsidian-cli'),
    })
    .optional(),
  linear: z
    .object({
      teamId: z.string().optional(),
      projectId: z.string().optional(),
    })
    .optional(),
});

const AgentConfigSchema = z.object({
  adapter: z.enum(['claude-code', 'aider', 'codex']).optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  timeoutMs: z.number().optional(),
});

const TrackerConfigSchema = z.object({
  adapter: z.enum(['github', 'gitlab', 'none']).optional(),
  branchTemplate: z.string().optional(),
  branchFallbackTemplate: z.string().optional(),
  ghPath: z.string().optional(),
});

export type PrStrategy = 'pr-per-task' | 'pr-per-task-to-integration' | 'local-integration';

const ExecutionConfigSchema = z.object({
  maxParallel: z.number().int().min(1).optional(),
  worktreeDir: z.string().optional(),
  preserveOnFailure: z.boolean().optional(),
  prStrategy: z.enum(['pr-per-task', 'pr-per-task-to-integration', 'local-integration']).optional(),
  mainBranch: z.string().optional(),
  integrationBranch: z.string().optional(),
});

const TuiConfigSchema = z.object({
  prPollMs: z.number().default(2 * 60_000),
  notifyOnReviewComments: z.boolean().default(true),
  theme: z.enum(['dark', 'light']).default('dark'),
});

export const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.number().default(1),
  project: z
    .object({
      name: z.string().optional(),
      rootBranchDetect: z.union([z.literal('auto'), z.string()]).default('auto'),
    })
    .optional(),
  storage: StorageConfigSchema.optional(),
  agent: AgentConfigSchema.optional(),
  tracker: TrackerConfigSchema.optional(),
  execution: ExecutionConfigSchema.optional(),
  tui: TuiConfigSchema.optional(),
});

export const GlobalConfigSchema = z.object({
  defaultStorage: z.string().default('local-sqlite'),
  defaultAgent: z.string().default('claude-code'),
  defaultTracker: z.string().default('github'),
  tui: TuiConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type TrackerConfig = z.infer<typeof TrackerConfigSchema>;

export interface ResolvedExecutionConfig {
  maxParallel: number;
  worktreeDir: string;
  preserveOnFailure: boolean;
  prStrategy: PrStrategy;
  mainBranch?: string;
  integrationBranch?: string;
}

export interface ResolvedConfig {
  storage: Required<z.infer<typeof StorageConfigSchema>>;
  agent: Required<z.infer<typeof AgentConfigSchema>>;
  tracker: Required<z.infer<typeof TrackerConfigSchema>>;
  execution: ResolvedExecutionConfig;
  tui: Required<z.infer<typeof TuiConfigSchema>>;
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  storage: {
    adapter: 'local-sqlite',
    obsidian: { vault: 'task-management', cli: 'obsidian-cli' },
    linear: {},
  } as ResolvedConfig['storage'],
  agent: {
    adapter: 'claude-code',
    model: 'sonnet',
    permissionMode: 'bypassPermissions',
    timeoutMs: 25 * 60_000,
  },
  tracker: {
    adapter: 'github',
    branchTemplate: 'feature/{ticket}-{id}-{slug}',
    branchFallbackTemplate: 'task/{id}',
    ghPath: 'gh',
  },
  execution: {
    maxParallel: 3,
    worktreeDir: '.worktrees',
    preserveOnFailure: true,
    prStrategy: 'pr-per-task',
  },
  tui: {
    prPollMs: 2 * 60_000,
    notifyOnReviewComments: true,
    theme: 'dark',
  },
};
