import type { ResolvedConfig } from '../config/schema.js';
import { OraleError } from '../core/errors.js';
import type { AgentAdapter } from './agent/interface.js';
import type { StorageAdapter } from './storage/interface.js';
import type { TrackerAdapter } from './tracker/interface.js';

export class AdapterRegistry {
  private storageFactories = new Map<string, (config: ResolvedConfig) => StorageAdapter>();
  private agentFactories = new Map<string, (config: ResolvedConfig) => AgentAdapter>();
  private trackerFactories = new Map<string, (config: ResolvedConfig) => TrackerAdapter>();

  registerStorage(name: string, factory: (config: ResolvedConfig) => StorageAdapter): this {
    this.storageFactories.set(name, factory);
    return this;
  }

  registerAgent(name: string, factory: (config: ResolvedConfig) => AgentAdapter): this {
    this.agentFactories.set(name, factory);
    return this;
  }

  registerTracker(name: string, factory: (config: ResolvedConfig) => TrackerAdapter): this {
    this.trackerFactories.set(name, factory);
    return this;
  }

  resolveStorage(config: ResolvedConfig): StorageAdapter {
    const name = config.storage.adapter;
    const factory = this.storageFactories.get(name);
    if (!factory) {
      throw new OraleError(
        `Unknown storage adapter: "${name}". Available: ${[...this.storageFactories.keys()].join(', ')}`,
        'UNKNOWN_ADAPTER',
      );
    }
    return factory(config);
  }

  resolveAgent(config: ResolvedConfig): AgentAdapter {
    const name = config.agent.adapter;
    const factory = this.agentFactories.get(name);
    if (!factory) {
      throw new OraleError(
        `Unknown agent adapter: "${name}". Available: ${[...this.agentFactories.keys()].join(', ')}`,
        'UNKNOWN_ADAPTER',
      );
    }
    return factory(config);
  }

  resolveTracker(config: ResolvedConfig): TrackerAdapter {
    const name = config.tracker.adapter;
    const factory = this.trackerFactories.get(name);
    if (!factory) {
      throw new OraleError(
        `Unknown tracker adapter: "${name}". Available: ${[...this.trackerFactories.keys()].join(', ')}`,
        'UNKNOWN_ADAPTER',
      );
    }
    return factory(config);
  }
}

/** Global singleton registry with built-in adapters registered. */
export async function createDefaultRegistry(config: ResolvedConfig): Promise<AdapterRegistry> {
  const registry = new AdapterRegistry();

  // Storage adapters
  const { ObsidianStorageAdapter } = await import('./storage/obsidian.js');
  const { LocalJsonStorageAdapter } = await import('./storage/local-json.js');

  registry.registerStorage('obsidian', (cfg) => new ObsidianStorageAdapter(cfg));
  registry.registerStorage('local-json', (cfg) => new LocalJsonStorageAdapter(cfg));

  // Try to load SQLite (optional dep)
  try {
    const { LocalSqliteStorageAdapter } = await import('./storage/local-sqlite.js');
    registry.registerStorage('local-sqlite', (cfg) => new LocalSqliteStorageAdapter(cfg));
  } catch {
    // Fall back to local-json if better-sqlite3 not available
    registry.registerStorage('local-sqlite', (cfg) => new LocalJsonStorageAdapter(cfg));
  }

  // Agent adapters
  const { ClaudeCodeAgentAdapter } = await import('./agent/claude-code.js');
  registry.registerAgent('claude-code', (cfg) => new ClaudeCodeAgentAdapter(cfg));

  // Tracker adapters
  const { GitHubTrackerAdapter } = await import('./tracker/github.js');
  registry.registerTracker('github', (cfg) => new GitHubTrackerAdapter(cfg));

  return registry;
}
