# Storage: SQLite — Decision Log

## Current state

The default storage adapter is `local-sqlite`, backed by `better-sqlite3` in
`optionalDependencies`. On platforms where the native addon cannot be installed
(e.g. musl containers, Windows without build tools), the adapter registry falls
back transparently to `local-json` under the same `local-sqlite` key.

Both adapters write to the same global directory by default:

- SQLite: `~/.local/share/orale/orale.db`
- JSON:   `~/.local/share/orale/tasks.json`

## History

`better-sqlite3` was temporarily removed (2025) to avoid a deprecation warning
from its transitive dependency `prebuild-install@7.1.3`. It was restored once
the team decided the warning was acceptable given SQLite's reliability and
query-filter advantages over JSON.

## Adapter code locations

| File | Role |
|---|---|
| `src/adapters/storage/local-sqlite.ts` | SQLite adapter implementation |
| `src/adapters/storage/local-json.ts`   | JSON fallback adapter |
| `src/adapters/registry.ts`             | Adapter registration; optional-dep fallback |
| `src/config/schema.ts`                 | `DEFAULT_CONFIG.storage.adapter` default |
| `src/config/paths.ts`                  | `globalPaths.db` and `globalPaths.data` |
