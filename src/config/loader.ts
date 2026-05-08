import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { cwd } from 'node:process';
import { ConfigError } from '../core/errors.js';
import { globalPaths } from './paths.js';
import {
  DEFAULT_CONFIG,
  type GlobalConfig,
  GlobalConfigSchema,
  type ProjectConfig,
  ProjectConfigSchema,
  type ResolvedConfig,
} from './schema.js';

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function findProjectRoot(startDir: string = cwd()): Promise<string | null> {
  let dir = startDir;
  while (true) {
    const oraleConfig = join(dir, '.orale', 'config.json');
    try {
      await readFile(oraleConfig);
      return dir;
    } catch {
      const parent = join(dir, '..');
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export async function loadConfig(projectRoot?: string): Promise<{
  config: ResolvedConfig;
  projectRoot: string | null;
}> {
  const root = projectRoot ?? (await findProjectRoot()) ?? null;

  const globalRaw = await readJsonFile<GlobalConfig>(globalPaths.config);
  const projectRaw = root
    ? await readJsonFile<ProjectConfig>(join(root, '.orale', 'config.json'))
    : null;
  const localRaw = root
    ? await readJsonFile<ProjectConfig>(join(root, '.orale', 'config.local.json'))
    : null;

  let global_: GlobalConfig | null = null;
  if (globalRaw) {
    const parsed = GlobalConfigSchema.safeParse(globalRaw);
    if (!parsed.success) {
      throw new ConfigError(`Invalid global config: ${parsed.error.message}`, globalPaths.config);
    }
    global_ = parsed.data;
  }

  let project: ProjectConfig | null = null;
  if (projectRaw) {
    const parsed = ProjectConfigSchema.safeParse(projectRaw);
    if (!parsed.success) {
      throw new ConfigError(
        `Invalid project config: ${parsed.error.message}`,
        join(root!, '.orale', 'config.json'),
      );
    }
    project = parsed.data;
  }

  let local: ProjectConfig | null = null;
  if (localRaw) {
    const parsed = ProjectConfigSchema.safeParse(localRaw);
    if (!parsed.success) {
      throw new ConfigError(`Invalid local config: ${parsed.error.message}`);
    }
    local = parsed.data;
  }

  // Merge: defaults → global → project → local → env
  const resolved: ResolvedConfig = {
    storage: {
      ...DEFAULT_CONFIG.storage,
      ...(global_?.defaultStorage
        ? { adapter: global_.defaultStorage as ResolvedConfig['storage']['adapter'] }
        : {}),
      ...project?.storage,
      ...local?.storage,
    },
    agent: {
      ...DEFAULT_CONFIG.agent,
      ...(global_?.defaultAgent
        ? { adapter: global_.defaultAgent as ResolvedConfig['agent']['adapter'] }
        : {}),
      ...project?.agent,
      ...local?.agent,
    },
    tracker: {
      ...DEFAULT_CONFIG.tracker,
      ...(global_?.defaultTracker
        ? { adapter: global_.defaultTracker as ResolvedConfig['tracker']['adapter'] }
        : {}),
      ...project?.tracker,
      ...local?.tracker,
    },
    execution: {
      ...DEFAULT_CONFIG.execution,
      ...project?.execution,
      ...local?.execution,
    },
    tui: {
      ...DEFAULT_CONFIG.tui,
      ...global_?.tui,
      ...project?.tui,
      ...local?.tui,
    },
  };

  applyEnvOverrides(resolved);

  if (resolved.storage.path && root && !isAbsolute(resolved.storage.path)) {
    resolved.storage.path = join(root, resolved.storage.path);
  }

  return { config: resolved, projectRoot: root };
}

function applyEnvOverrides(config: ResolvedConfig): void {
  if (process.env.ORALE_STORAGE_ADAPTER) {
    config.storage.adapter = process.env
      .ORALE_STORAGE_ADAPTER as ResolvedConfig['storage']['adapter'];
  }
  if (process.env.ORALE_AGENT_ADAPTER) {
    config.agent.adapter = process.env.ORALE_AGENT_ADAPTER as ResolvedConfig['agent']['adapter'];
  }
  if (process.env.ORALE_MAX_PARALLEL) {
    config.execution.maxParallel = Number.parseInt(process.env.ORALE_MAX_PARALLEL, 10);
  }
  if (process.env.ORALE_AGENT_MODEL) {
    config.agent.model = process.env.ORALE_AGENT_MODEL;
  }
  if (process.env.ORALE_AGENT_TIMEOUT_MS) {
    config.agent.timeoutMs = Number.parseInt(process.env.ORALE_AGENT_TIMEOUT_MS, 10);
  }
}
