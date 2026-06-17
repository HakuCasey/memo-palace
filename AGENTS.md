# AGENTS.md

> **新 Agent 第一次接触本仓库？** 先读 `ONBOARDING.md`（心智模型 + 工作流）；本文是工作时的速查表。

## Project

MemoPalace — self-evolving memory palace for code agents. Client-server: CLI/MCP/Hook clients talk to a Fastify server backed by SQLite+FTS5. Three-layer memory (Floor/Room metaphor): Episodic Floor (4 rooms) → Semantic Floor (3 rooms) → Procedural Floor (2 rooms, file-based), with consolidation as the core evolution mechanism.

Docs and specs in Chinese; code identifiers and schemas in English.

## Commands (run from `src/`)

```bash
npm install              # server + client deps
cd web && npm install    # web console deps (separate node_modules)

npm run dev:server       # start server (tsx watch, port 5678)
npm run dev:web          # start web console (vite, port 5173, proxies /api → :5678)

npm test                 # vitest run (all tests)
npm run test:watch       # vitest watch

npm run typecheck        # tsc --noEmit for both server and client configs
npm run lint             # eslint . --ext .ts
```

Verification order: `lint` → `typecheck` → `test`

### Single test / focused test

```bash
npx vitest run server/__tests__/e2e.test.ts
npx vitest run -t "search across layers"
```

## Architecture

All code, build artifacts, and test output live under `src/`. Nothing that belongs to build or runtime should appear at the repo root.

```
src/
  server/
    index.ts          # Fastify app entrypoint (db init, route registration, CORS)
    db/
      connection.ts   # createDb() — WAL mode, foreign_keys ON
      schema.ts       # initSchema() — DDL for all tables + FTS5 virtual tables + triggers
    routes/           # One file per resource: episodic, semantic, procedural, search, evolution, system, analyzer
    services/         # Retriever (FTS5 + fallback), Analyzer (rule-based scan), Evolver (task execution), Importer, Sources
    types.ts          # Shared TypeScript interfaces for all memory layers and API I/O
    web/index.ts      # Serves SPA static files in production (/app/*)
  server/services/pipeline/
    candidate-types.ts  # Candidate discriminated union + type guards + mainText helper
    filter-engine.ts    # Rule evaluation engine (evaluateRules, FilterRuleRow, EvalResult)
    stages/
      normalizer.ts    # Normalizer stage (per-channel parsers: huawei_forum, opencode_sessions, manual)
      filter.ts        # Filter stage (DB-driven rule engine via filter-engine.ts)
  clients/
    api-client.ts     # MemoPalaceClient — unified HTTP client used by all client entry points
    cli/              # commander-based CLI (`memopalace search/upload/self-check/status`)
    mcp-server/       # MCP stdio server (4 tools: search, upload, self_check, status)
    hook/             # Hook event processor (error_signal → search → suggestion)
  web/                # React SPA (Vite), separate package.json, proxies /api in dev
  schemas/            # JSON Schema definitions for memory types
  tools/              # import-cases.ts — bulk import from mvp_episodic.jsonl (--file to override)
  envolution/         # Evolution runtime data: evo_rules/, evo_history/ (currently empty)
  memory/
    episodic/         # Episodic memory data artifacts (organized by episodic_type)
    semantic/         # Semantic memory data artifacts (organized by semantic_type)
    procedural/       # Procedural memory storage — file-based JSON, NOT SQLite
      skill/          # Skill definitions (JSON files)
      workflow/       # Workflow definitions (JSON files)
  bin/memopalace.js   # CLI global command entry point (npm link)
  assets/
    pipeline/         # Pipeline data: normalizer/all.jsonl, filter/all.jsonl, evolved/high_value.jsonl
    sources/          # Raw data sources: expert_docs/, github/, huawei_forum/, opencode_sessions/
```

## Key Constraints

- **Two `package.json`**: `src/package.json` (server+clients) and `src/web/package.json` (SPA). `npm install` must run in both.
- **Two `tsconfig`**: `tsconfig.server.json` (server + clients), `tsconfig.client.json` (clients only). Both extend `tsconfig.json`. The `typecheck` script runs both.
- **No vitest config file**: vitest auto-discovers from `package.json`. Tests use `:memory:` SQLite — no real DB needed.
- **SQLite DB file**: defaults to `src/memopalace.db`, configurable via `MEMOPALACE_DB` env var. Server port via `PORT` (default 5678).
- **ESM project with `.js` imports**: `"type": "module"` in package.json. All local imports must end in `.js` despite `.ts` source files. This is the most common mistake — do NOT use `.ts` extensions in import paths.
- **FTS5 triggers auto-sync**: `episodic_fts` and `semantic_fts` are kept in sync via AFTER INSERT/UPDATE/DELETE triggers on the main tables. Never write to FTS tables directly.
- **Evolution tasks are idempotent**: `generateTaskId()` hashes type+source IDs, so duplicate scans won't create duplicate tasks.
- **`group_key` convention**: plain error_code for same-code grouping; `category::fix_strategy` for same-category grouping (distinguished by `LIKE '%::%'`).
- **JSON columns in DB**: Sub-objects (trigger, resolution, context, tags, consolidation, etc.) are stored as JSON text columns (`*_json`). They must be stringified on insert and parsed on read. The route handlers handle this marshalling.
- **`episodic_type` is required on create**: Values: `debug_case`, `api_trap`, `config_trap`, `dev_note`. Maps to `memory/episodic/<room>/` directories. Indexed in DB.
- **`semantic_type` is required on create**: Values: `pattern`, `best_practice`, `dev_specification`. Maps to `memory/semantic/<room>/` directories. Indexed in DB.
- **`procedural_type` is required on create**: Values: `skill`, `workflow`. Maps to `memory/procedural/<room>/` directories. Not in SQLite — file-only.
- **Floor/Room naming convention**: `memory/<floor>/<room>/` directory paths correspond to `episodic_type`, `semantic_type`, and `procedural_type` field values.
- **Web SPA types are duplicated**: `src/web/src/api.ts` re-declares the same TypeScript interfaces as `src/server/types.ts`. Changes to one must be reflected in the other.
- **Server startup scripts**: `src/memo_start.ps1` and `src/memo_start.bat` auto-start both server and web console.
- **CLI install**: `cd src && npm link` to make `memopalace` available globally. CLI reads server URL from: `MEMOPALACE_URL` env → `~/.memopalace/config.json` → `http://localhost:5678`.
- **Test pattern**: Tests build a per-test Fastify app with `:memory:` SQLite via `buildApp()` helper. No shared state between test files.
- **Pipeline 中间态存储**: `src/assets/pipeline/<stage: normalizer|filter>/all.jsonl` is append-only JSONL containing `_pipeline` metadata. Failed items written to `.errors/<stage>_error.jsonl`; ignored items written to `.skiplist.json`. Server registers stages and scheduler via `src/server/services/pipeline/`.
- **新数据库表**: `pipeline_run`, `pipeline_schedule` (see `src/server/db/schema.ts`). Existing tables unchanged.
- **调度**: In-process `node-cron`; `loadSchedules(db, sourcesRoot)` runs at startup. Overlapping runs are NOT queued — they write a `status='skipped'` row instead.
- **Pipeline stages are `normalizer` and `filter` only** (RFC-004 reduced from 4 to 2). The materialize step is replaced by user-driven `POST /api/episodic` from the Collection page's High Value zone.
- **`filter_rule` table holds configurable rules**; default seeded on first run via `bootstrap.ts`. Three seed rules: 标题不为空, 标签不为空, 内容长度≥100.
- **Normalizer source-file filter** uses a module-level `setSourceFileFilter()` (called by `/api/pipeline/batch-run`); reset to `null` after each run.
- **Scheduler skips normalizer** when no source files have changed since the last successful run (`sourcesChangedSince` helper in scheduler.ts).

## Push Scope (dev branch)

`dev` branch diverges from `main` (which only has `LICENSE`). All project files are untracked on `dev`. Before `git add`, exclude these categories:

### Do NOT push (add to .gitignore or exclude per-add)

| Pattern | Reason |
|---------|--------|
| `src/web/tsconfig.tsbuildinfo` | Build artifact, regenerated on `tsc -b` |
| `src/debug-schema.cjs` | Dev-only debug script, not runtime |
| `src/assets/pipeline/normalizer/normalized_error.jsonl` | Empty file, pipeline runtime error output |
| `src/assets/pipeline/filter/filtered_error.jsonl` | Pipeline runtime error output, regenerable |
| `.opencode/plugins/memopalace/log.md` | Session log (83KB), runtime data |
| `.opencode/plugins/memopalace/*.ts` | Local OpenCode plugin, install-specific |
| `.opencode/skills/drawio/SKILL.md` | Copied from superpowers npm package, not project-owned |

### Push these (essential for build/test/pipeline)

- `.gitignore`, `AGENTS.md`, `README.md`
- `src/package.json`, `src/package-lock.json`, `src/tsconfig*.json`, `src/eslint.config.js`
- `src/server/**`, `src/clients/**`, `src/web/**`, `src/schemas/**`, `src/bin/**`
- `src/tools/**`, `src/memo_start.*`, `src/@types/**`
- `src/memory/**`, `src/envolution/**` — Floor/Room directory structure with `.gitkeep` placeholders; pre-existing memory data files for quick deployment
- `src/assets/sources/**` — raw pipeline input data (largest: `huawei_raw_2026-05-25.jsonl` at 519KB)
- `src/assets/pipeline/evolved/high_value.jsonl` — seed data for Collection page
- `src/assets/troubleshooting.md`, `src/assets/sources/manual/sample_001.txt`
- `.opencode/opencode.json` — project config for collaborators

### Suggested git add command

All exclusions are already in `.gitignore`, so a simple `git add .` works. For a more deliberate approach:

```bash
git add .gitignore AGENTS.md README.md
git add src/package.json src/package-lock.json src/tsconfig.json src/tsconfig.server.json src/tsconfig.client.json src/eslint.config.js
git add src/@types/ src/bin/ src/server/ src/clients/ src/schemas/ src/tools/ src/web/
git add src/memo_start.ps1 src/memo_start.bat
git add src/memory/ src/envolution/
git add src/assets/sources/ src/assets/pipeline/evolved/ src/assets/troubleshooting.md
git add .opencode/opencode.json
```

## Spec Process

New features follow RFC pattern under `docs/specs/`. Each RFC directory: `proposal.md` → `delta-design.md` → `delta-spec.md` → `tasks.md`.

## Debug Case Schema

`src/schemas/debug-case-schema.json` — `dc_id` pattern: `dc_(hm|gh|git)_[a-z0-9_]+`. Legacy format for `POST /api/import`. Current pipeline data flow: `assets/sources/<channel>/*.jsonl` (raw) → normalizer → filter → `assets/pipeline/evolved/high_value.jsonl` (Candidate format) → `POST /api/episodic` (user-driven).

## ID Generation Patterns

- Episodic: `ep_{source}_{8-char-hash}` (source: `manual`, `crawler`, `opencode_hook`)
- Semantic: `sm_{category}_{8-char-hash}`
- Procedural: `pm_{procedural_type}_{8-char-hash}` (procedural_type: `skill` or `workflow`)
- Evolution task: `et_{type}_{8-char-hash}` (hash from type + sorted source IDs)
- Candidate: `cand_{8-char-hash}` (hash from source_file + channel + raw_id)
- Filter rule: `fr_{8-char-hash}` (hash from rule name; seeded rules use deterministic hash, user-created rules use name+timestamp+random)
- All hashes use `crypto.createHash('sha256').update(...).digest('hex').slice(0, 8)`

## API Quick Reference

| Path | Method | Notes |
|------|--------|-------|
| `/api/episodic` | POST/GET | Create/list episodic memories |
| `/api/episodic/:id` | GET/PATCH | Get/update; PATCH with status=resolved auto-computes group_key |
| `/api/semantic` | POST/GET | Create/list semantic memories |
| `/api/semantic/:id` | GET/PATCH | Get/update |
| `/api/procedural` | POST/GET | Create/list procedural memories |
| `/api/procedural/:id` | GET/PATCH/DELETE | Get/update/delete |
| `/api/search` | POST | Body: `{query, layer?, limit?, episodic_type?, semantic_type?}`. Returns `{procedural[], semantic[], episodic[]}` |
| `/api/evolution/analyze` | POST | Runs analyzer rules, returns `{new_tasks: count}` |
| `/api/evolution/tasks` | GET | Lists pending evolution tasks |
| `/api/evolution/tasks/:id/confirm` | POST | Confirms + executes task |
| `/api/evolution/tasks/:id/reject` | POST | Rejects task |
| `/api/evolution/history` | GET | Completed/rejected tasks |
| `/api/status` | GET | Server uptime + memory counts |
| `/api/self-check` | GET | DB health + memory stats |
| `/api/import` | POST | Import array of episodic data |
| `/api/pipeline/stages` | GET | List stages with last-run summary |
| `/api/pipeline/stages/:id/items` | GET | List input items (skiplist filtered) |
| `/api/pipeline/stages/:id/run` | POST | Manual run; body `{ ids?, dryRun? }` |
| `/api/pipeline/stages/:id/ignore` | POST | Add ids to `.skiplist.json` |
| `/api/pipeline/runs/:id/retry` | POST | Retry failed items as a new run |
| `/api/pipeline/runs/:id/errors` | DELETE | Clear error detail for a run |
| `/api/pipeline/run-all` | POST | Chained normalizer → filter |
| `/api/pipeline/batch-run` | POST | Run normalizer→filter for selected source files; body `{ ids: string[] }` |
| `/api/pipeline/artifacts/:bucket` | GET | List candidates/high_value items; buckets: `candidates` or `high_value` |
| `/api/sources` | GET | List source files grouped by channel |
| `/api/analyzer/rules` | GET/POST | List / create filter rules |
| `/api/analyzer/rules/:id` | PATCH/DELETE | Update / delete a filter rule |
| `/api/analyzer/rules/reorder` | POST | Reorder rule priorities; body `{ ids: string[] }` |
| `/api/pipeline/runs` | GET/DELETE | List / bulk clear (requires `confirm:true`) |
| `/api/pipeline/runs/:id` | GET | Run detail |
| `/api/pipeline/runs/stats` | GET | Total + over-threshold flag |
| `/api/schedule` | GET/POST | List / upsert schedule |
| `/api/schedule/:id` | DELETE | Remove schedule |
