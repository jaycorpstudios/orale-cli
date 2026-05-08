# orale — Agent Orchestrator

orale is a CLI tool that orchestrates Claude Code agents across parallel git worktrees. You describe a feature, decompose it into tasks with `/orale:plan` and `/orale:tasks`, and orale executes them concurrently — each in its own isolated branch — then creates pull requests for review.

## Architecture

- **Orchestrator** (`src/core/orchestrator.ts`) — central engine: preflight, batch execution, PR sync, conflict resolution
- **Adapters** — pluggable backends loaded via `AdapterRegistry` (`src/adapters/registry.ts`):
  - Storage: `local-sqlite` (default), `local-json`, `obsidian`
  - Agent: `claude-code` (invokes `claude --print`)
  - Tracker: `github` (invokes `gh` CLI)
- **Worktrees** (`src/core/worktree.ts`) — per-task git worktree lifecycle with resume detection
- **Batch builder** (`src/core/batch.ts`) — Kahn's topological sort; tasks without deps run in batch 1
- **Events** (`src/core/events.ts`) — typed `OraleEventEmitter` for `task:started`, `task:completed`, `task:failed`, `pr:synced`
- **TUI** (`src/tui/`) — Ink/React Kanban dashboard; state via `useOraleStore` (Zustand); `useTaskPolling` (4s), `usePrPolling` (2m)
- **Skills** (`skills/orale:*/SKILL.md`) — Claude Code slash commands installed by `orale init`

## Dev

```bash
npm run dev           # tsup --watch (rebuilds on change)
npm run orale         # tsx src/cli/index.ts (run from source)
npm run typecheck     # tsc --noEmit
npm run lint          # biome check .
npm run lint:fix      # biome check --write .
```

## Build

```bash
npm run build         # tsup → dist/
```

## CLI Commands

| Command | Purpose |
|---|---|
| `orale` | Launch TUI Kanban dashboard |
| `orale init` | Create `.orale/config.json`, install skills |
| `orale doctor` | Check prerequisites: node ≥20, git, gh, gh auth, claude |
| `orale run <ids> --project <path>` | Execute tasks immediately (`--dry-run`, `--retry-failed`, `--max-parallel`) |
| `orale watch --project <path>` | Daemon: poll for in-progress tasks, run up to maxParallel concurrently |
| `orale tasks list\|show\|move\|create-batch` | Task CRUD |
| `orale import obsidian` | Migrate tasks from an Obsidian vault |

## Skills

Installed to `.claude/skills/` (project) or `~/.claude/skills/` (global) by `orale init`.

| Skill | What it does |
|---|---|
| `/orale:plan` | 2-phase: explore codebase → produce feature proposal (waits for approval) |
| `/orale:tasks` | 3-phase: get plan → decompose into tasks → call `orale tasks create-batch` |
| `/orale:review` | Calls `orale run <id> --address-review-comments` for tasks in code-review |

## Config

Three-layer merge: defaults → `~/.orale/config.json` → `.orale/config.json` → `.orale/config.local.json` → env vars.

| Env var | Effect |
|---|---|
| `ORALE_STORAGE_ADAPTER` | Override storage adapter |
| `ORALE_AGENT_ADAPTER` | Override agent adapter |
| `ORALE_MAX_PARALLEL` | Override max concurrent agents |
| `ORALE_AGENT_MODEL` | Override claude model |
| `ORALE_AGENT_TIMEOUT_MS` | Override agent timeout |

Defaults: `local-sqlite`, `claude-code`, model `sonnet`, 25min timeout, 3 parallel, `.worktrees` dir.

## Code Conventions

### Named conditions — always extract raw comparisons

Every `if` guard or filter predicate must use a named `const` that describes **what is being evaluated**, not the raw value. This is the most important convention in the codebase.

```typescript
// Bad — reader must parse the expression to understand intent
if (state.state === 'merged') { ... }
if (active.size >= maxParallel) { ... }
if (!commits && !uncommitted) return null;

// Good — intent is immediately clear
const isPrMerged = state.state === 'merged';
const isAtCapacity = active.size >= maxParallel;
const hasNoMeaningfulProgress = !commits && !uncommitted;

if (isPrMerged) { ... }
if (isAtCapacity) { ... }
if (hasNoMeaningfulProgress) return null;
```

Names must state intent:
- `isPrMerged` not `stateIsMerged`
- `isAtCapacity` not `activeSizeGteMax`
- `hasDependenciesResolved` not `depsEveryDone`
- `shouldResetFailedStatus` not `retryFailedAndStatusIsFailed`

When the same condition appears in 2+ call sites, extract it as a named function in `src/core/task.ts`:
- `isTaskEligible(task, retryFailed?)` — whether a task can be executed
- `hasDependenciesResolved(task, statusMap)` — whether all deps are done

### Adapter pattern

1. Define interface in `src/adapters/<type>/interface.ts`
2. Implement it in `src/adapters/<type>/<name>.ts`
3. Register in `createDefaultRegistry` in `src/adapters/registry.ts`

### Error classes

Use typed subclasses from `src/core/errors.ts`: `OraleError`, `AdapterError`, `ConfigError`, `TaskNotFoundError`, `DependencyCycleError`, `AgentTimeoutError`.

### Task status constants

Use constants from `src/core/task.ts` instead of string literals:

```typescript
TERMINAL_STATUSES  // ['done', 'failed']
ACTIVE_STATUSES    // ['in-progress']
ELIGIBLE_STATUSES  // ['todo']
```
