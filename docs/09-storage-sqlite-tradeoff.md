# Storage: SQLite vs JSON — Decision Log

## Current state

The default storage adapter is `local-sqlite` (configured in `DEFAULT_CONFIG` in `src/config/schema.ts`), but `better-sqlite3` is **not listed as a dependency**. When `better-sqlite3` is absent, the registry silently falls back to `LocalJsonStorageAdapter` under the same `local-sqlite` key (see `src/adapters/registry.ts`). In practice, new installs run on JSON storage.

Both adapters write to the same global directory by default:

- SQLite: `~/.local/share/orale/orale.db`
- JSON:   `~/.local/share/orale/tasks.json`

Tasks from all projects share this single store; the `project` field (absolute path) is used to filter per-project.

## Why `better-sqlite3` was removed

`better-sqlite3` transitively depends on `prebuild-install@7.1.3`, which is deprecated. The deprecation warning was visible to every user on `npx orale-cli`, producing noisy output on a fresh install before the tool had done anything useful.

`better-sqlite3` is a native addon (requires C++ build tools or a pre-built binary download). Keeping it in `optionalDependencies` caused npm to attempt the install and show the warning on every `npx` invocation. Moving it to regular `dependencies` would have made the warning permanent *and* broken installs on platforms without native build toolchains (Windows without Visual Studio, some CI environments).

For the scale of tasks orale manages (typically tens to low hundreds per project), JSON file I/O has no measurable performance disadvantage over SQLite.

## How to restore SQLite support

When `better-sqlite3` updates its dependency chain away from `prebuild-install` (expected in a future major release), add it back as follows:

1. **`package.json`** — add to `optionalDependencies`:
   ```json
   "optionalDependencies": {
     "better-sqlite3": "^<latest>"
   }
   ```
   and to `devDependencies`:
   ```json
   "@types/better-sqlite3": "^<latest>"
   ```

2. **Run `npm install`** — regenerates `package-lock.json` with the new entries.

3. **Verify no deprecation warnings** appear in the install output. If `prebuild-install` still appears in the tree, the upstream issue is unresolved — wait for the next release.

4. **No code changes required.** `src/adapters/registry.ts` already wraps the import in a try/catch and registers the fallback; `src/adapters/storage/local-sqlite.ts` dynamically imports `better-sqlite3` only at init time. The moment the package is available, `LocalSqliteStorageAdapter` becomes active automatically.

5. Optionally, update `DEFAULT_CONFIG.storage.adapter` in `src/config/schema.ts` to ensure `local-sqlite` is the documented and intentional default once the warning is gone.

## Adapter code locations

| File | Role |
|---|---|
| `src/adapters/storage/local-sqlite.ts` | SQLite adapter implementation |
| `src/adapters/storage/local-json.ts` | JSON adapter implementation |
| `src/adapters/registry.ts` | Registers adapters; contains the try/catch fallback |
| `src/config/schema.ts` | `DEFAULT_CONFIG.storage.adapter` default value |
| `src/config/paths.ts` | `globalPaths.db` and `globalPaths.data` — where files live on disk |
