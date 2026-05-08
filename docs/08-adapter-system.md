# Adapter System

Config-driven resolution from `ResolvedConfig` through `AdapterRegistry` to concrete implementations.

```mermaid
graph TD
    CFG["ResolvedConfig\nsrc/config/schema.ts"]
    REG["AdapterRegistry\nsrc/adapters/registry.ts"]

    subgraph Storage ["Storage Adapters"]
        SI["StorageAdapter interface\nsrc/adapters/storage/interface.ts"]
        SJ["LocalJsonStorageAdapter\nlocal-json.ts"]
        SS["LocalSqliteStorageAdapter\nlocal-sqlite.ts"]
        SO["ObsidianStorageAdapter\nobsidian.ts"]
    end

    subgraph Agent ["Agent Adapters"]
        AI["AgentAdapter interface\nsrc/adapters/agent/interface.ts"]
        AC["ClaudeCodeAgentAdapter\nclaude-code.ts"]
    end

    subgraph Tracker ["Tracker Adapters"]
        TI["TrackerAdapter interface\nsrc/adapters/tracker/interface.ts"]
        TG["GitHubTrackerAdapter\ngithub.ts"]
    end

    CFG -->|storage.adapter| REG
    CFG -->|agent.adapter| REG
    CFG -->|tracker.adapter| REG

    REG -->|resolveStorage| SI
    SI --> SJ
    SI --> SS
    SI --> SO

    REG -->|resolveAgent| AI
    AI --> AC

    REG -->|resolveTracker| TI
    TI --> TG

    AC -->|"claude --print --model ..."| ExtClaude[("Claude Code CLI")]
    TG -->|"gh pr view / gh api"| ExtGH[("GitHub CLI")]
    SS -->|"better-sqlite3"| ExtDB[("SQLite .orale/tasks.db")]
    SO -->|"obsidian-cli"| ExtObs[("Obsidian vault")]
```

## Adding a new adapter

1. Add the adapter key to the union in `src/config/schema.ts`
2. Create `src/adapters/<type>/<name>.ts` implementing the interface
3. Register it in `createDefaultRegistry` in `src/adapters/registry.ts`
