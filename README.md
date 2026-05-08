# orale

Orchestrate Claude Code agents across parallel git worktrees. Describe a feature, decompose it into tasks, and let orale execute them concurrently — each in its own isolated branch — creating pull requests ready for review.

## How it works

```
┌─────────────────────────────────────────────────────┐
│  /orale:plan → /orale:tasks                         │
│  Plan feature → decompose into tasks                │
└──────────────────────┬──────────────────────────────┘
                       │ orale tasks create-batch
              ┌────────▼────────┐
              │  Storage (SQLite │
              │  / JSON / ...)   │
              └────────┬────────┘
                       │
          ┌────────────▼────────────┐
          │  orale run / orale      │
          │  Per task:              │
          │  1. git worktree        │
          │  2. claude --print      │
          │  3. gh pr create        │
          │  4. status: code-review │
          └─────────────────────────┘
```

---

## Requirements

- **Node.js** v20+
- **Claude Code CLI** (`claude`) — installed and authenticated
- **gh CLI** — installed and authenticated (`gh auth status`)
- **Git** configured in target projects
- **obsidian-cli** — optional, only needed if using `orale import obsidian`

---

## Installation

```bash
npm install -g orale
```

Or run directly from the repo:

```bash
git clone https://github.com/jaycorpstudios/orale-cli
cd orale-cli
npm install
npm run build
```

---

## Quick start

```bash
# 1. Check prerequisites
orale doctor

# 2. Initialize orale in your project
cd /path/to/your-project
orale init

# 3. Plan a feature (from inside your project, using Claude Code)
/orale:plan

# 4. Decompose into tasks
/orale:tasks

# 5. Launch the Kanban dashboard
orale

# — or run tasks directly —
orale run FEAT-001,FEAT-002 --project /path/to/your-project
```

---

## CLI reference

### `orale`

Launches the TUI Kanban dashboard. Shows tasks grouped by status with live progress, logs, and PR state.

```bash
orale
```

### `orale init`

Sets up orale in a project. Creates `.orale/config.json`, adds `.worktrees/` to `.gitignore`, and installs Claude Code skills.

```bash
orale init [--project <path>] [--storage sqlite|json|obsidian] [--agent claude-code] [--tracker github|none] [--no-skills] [--global]
```

### `orale doctor`

Validates all prerequisites. Checks Node.js version, git, gh, gh auth, claude, and optional obsidian-cli.

```bash
orale doctor
```

### `orale run`

Executes tasks immediately. Respects dependency order; tasks in the same batch run in parallel.

```bash
orale run <task-ids> --project <path> [--max-parallel 3] [--dry-run] [--retry-failed] [--extra-prompt "<context>"]
```

| Option | Default | Description |
|---|---|---|
| `--project` | — | Absolute path to project root (**required**) |
| `--max-parallel` | `3` | Max concurrent agent executions |
| `--dry-run` | `false` | Print batch plan without executing |
| `--retry-failed` | `false` | Re-execute tasks with status `failed` |
| `--extra-prompt` | — | Additional context injected into the agent prompt |

**Dry-run example:**

```bash
orale run FEAT-001,FEAT-002,FEAT-003 --project /path/to/project --dry-run
# Batch 1: FEAT-001
# Batch 2: FEAT-002, FEAT-003
# Dry run complete — no tasks executed.
```

### `orale watch`

Daemon that continuously polls for `in-progress` tasks and executes them. Set a task to `in-progress` in any storage backend and the watcher picks it up automatically.

```bash
orale watch --project <path> [--poll-interval 10] [--max-parallel 3]
```

| Option | Default | Description |
|---|---|---|
| `--project` | — | Absolute path to project root (**required**) |
| `--poll-interval` | `10` | Seconds between polls |
| `--max-parallel` | `3` | Max concurrent agent executions |

`Ctrl+C` triggers graceful shutdown — waits for active tasks before exiting.

### `orale tasks`

Task CRUD operations.

```bash
orale tasks list [--project <path>] [--status todo,in-progress] [--feature <name>] [--json]
orale tasks show <id>
orale tasks move <id> --status <status>
orale tasks create-batch --json '<json-array>' --project <path>
```

### `orale import obsidian`

Imports tasks from an Obsidian vault into the configured storage adapter. Deduplicates by task ID.

```bash
orale import obsidian --project <path> [--vault <vault-name>] [--feature <feature-filter>]
```

---

## Task lifecycle

```
todo → in-progress → code-review → done
              ↘ failed
              ↗ (--retry-failed)
code-review → in-progress (via /orale:review)
todo → blocked (dependency not done)
```

Statuses set automatically:
- `in-progress` — when orale starts executing the task
- `code-review` — when the agent creates a PR
- `done` — when the PR is merged (detected by `orale watch` / TUI polling)
- `failed` — on agent error or timeout

---

## Execution flow (per task)

```
1. status → in-progress, started_at = now
2. git worktree add -b task/{ID} .worktrees/{ID} origin/main
3. claude --print --model sonnet --permission-mode bypassPermissions "<prompt>"
4. Parse PR_URL: <url> from agent output
5. status → code-review, pr_url, completed_at, branch_name
6. git worktree remove .worktrees/{ID}
```

If the agent fails: `status → failed`, error stored in task, worktree preserved for debugging.

---

## Storage adapters

| Adapter | Description |
|---|---|
| `local-sqlite` | SQLite file at `.orale/tasks.db` (default) |
| `local-json` | JSON file at `.orale/tasks.json` |
| `obsidian` | Obsidian vault via obsidian-cli (requires Obsidian open) |

---

## Skills

Install via `orale init`, then use inside Claude Code:

| Skill | Trigger | Description |
|---|---|---|
| `/orale:plan` | `/orale:plan` | Explore codebase → propose a feature plan (waits for approval) |
| `/orale:tasks` | `/orale:tasks` | Decompose plan → create tasks via `orale tasks create-batch` |
| `/orale:review` | `/orale:review [id]` | Address unresolved PR review comments |

---

## Config

orale looks for `.orale/config.json` walking up from the current directory. Layers merge in this order: defaults → `~/.orale/config.json` → `.orale/config.json` → `.orale/config.local.json` → env vars.

```json
{
  "version": 1,
  "storage": { "adapter": "local-sqlite", "path": ".orale/tasks.db" },
  "agent": { "adapter": "claude-code", "model": "sonnet", "timeoutMs": 1500000 },
  "tracker": { "adapter": "github" },
  "execution": { "maxParallel": 3, "worktreeDir": ".worktrees", "preserveOnFailure": true }
}
```

Env var overrides: `ORALE_STORAGE_ADAPTER`, `ORALE_AGENT_ADAPTER`, `ORALE_MAX_PARALLEL`, `ORALE_AGENT_MODEL`, `ORALE_AGENT_TIMEOUT_MS`.

---

## Dependency management

Tasks are sorted topologically. Tasks in the same batch run in parallel; later batches wait for earlier ones to complete.

```
FEAT-001 (batch 1) — no dependencies
FEAT-002 (batch 2) — depends on FEAT-001
FEAT-003 (batch 2) — depends on FEAT-001
FEAT-004 (batch 3) — depends on FEAT-002, FEAT-003
```

If a task fails, all tasks that depend on it are skipped in later batches.

---

## Notes

### Worktrees
- Created at `<project>/.worktrees/{TASK-ID}` — automatically added to `.gitignore`
- Each agent inherits `.claude/`, `CLAUDE.md`, hooks, and skills from the project
- Worktrees are preserved on failure for debugging; cleaned up on success

### PRs
- PR titles, descriptions, and commits must not reference Claude or AI automation — the agent prompt enforces this
- If PR creation fails, the branch stays pushed and can be used to open the PR manually

### Parallel tasks
- Tasks in the same batch must not modify the same files — they will conflict on merge
- Plan tasks by module or layer to avoid overlap
