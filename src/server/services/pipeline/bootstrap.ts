import type Database from "better-sqlite3";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { clearRegistry, registerStage } from "./registry.js";
import { createNormalizerStage } from "./stages/normalizer.js";
import { createFilterStage } from "./stages/filter.js";
import { loadSchedules } from "./scheduler.js";

export interface PipelinePaths {
  sourcesRoot: string;
  normalizerDir: string;
  filterDir: string;
  evolvedDir: string;
  memoryRoot: string;
}

export function defaultPaths(repoRoot: string): PipelinePaths {
  return {
    sourcesRoot:   join(repoRoot, "assets/sources"),
    normalizerDir: join(repoRoot, "assets/pipeline/normalizer"),
    filterDir:     join(repoRoot, "assets/pipeline/filter"),
    evolvedDir:    join(repoRoot, "assets/pipeline/evolved"),
    memoryRoot:    join(repoRoot, "memory"),
  };
}

const DEFAULT_RULES = [
  { name: "标题不为空", field: "title",      operator: "not_empty", value_json: null,   priority: 100 },
  { name: "标签不为空", field: "tags",       operator: "not_empty", value_json: null,   priority: 90 },
  { name: "内容长度>=100", field: "_main_text", operator: "min_length", value_json: "100", priority: 80 },
];

function seedDefaultRules(db: Database.Database): void {
  const count = (db.prepare("SELECT COUNT(*) c FROM filter_rule").get() as { c: number }).c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO filter_rule (id,name,field,operator,value_json,enabled,priority,mode,created_at,updated_at) VALUES (?,?,?,?,?,1,?,'include',?,?)`);
  for (const r of DEFAULT_RULES) {
    const id = "fr_" + createHash("sha256").update(r.name).digest("hex").slice(0, 8);
    stmt.run(id, r.name, r.field, r.operator, r.value_json, r.priority, now, now);
  }
}

function purgeLegacySchedules(db: Database.Database): void {
  db.prepare("DELETE FROM pipeline_schedule WHERE stage_id IN ('collect','shape','materialize')").run();
}

export function bootstrapPipeline(db: Database.Database, paths: PipelinePaths): void {
  clearRegistry();
  registerStage(createNormalizerStage(paths.sourcesRoot, paths.normalizerDir, paths.evolvedDir));
  registerStage(createFilterStage(db, paths.evolvedDir, paths.filterDir));
  seedDefaultRules(db);
  purgeLegacySchedules(db);
  loadSchedules(db, paths.sourcesRoot);
}
