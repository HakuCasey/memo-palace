import { join } from "node:path";
import { writeFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { readJsonl, appendJsonl, readSkiplist } from "../helpers/jsonl.js";
import { evaluateRules, type FilterRuleRow } from "../filter-engine.js";
import type { PipelineStage, StageItem, StageResult, StageError, StageDropped, StageHistoryEntry } from "../types.js";
import type { Candidate } from "../candidate-types.js";

export function createFilterStage(db: Database.Database, evolvedDir: string, filterDir: string): PipelineStage {
  const inFile = join(evolvedDir, "high_value.jsonl");
  const errorFile = join(filterDir, "filtered_error.jsonl");
  const skipFile = join(filterDir, ".skiplist.json");
  const outFile = join(evolvedDir, "high_value.jsonl");

  return {
    id: "filter",

    async inputs(): Promise<StageItem[]> {
      const skipped = new Set(readSkiplist(skipFile));
      return readJsonl(inFile).filter(i => {
        if (skipped.has(i.id)) return false;
        if (!(i.payload as any)?.source_channel) return false;
        const history = (i as any)._pipeline?.stage_history ?? [];
        return !history.some((h: any) => h.stage_id === "filter");
      });
    },

    async run(items, ctx): Promise<StageResult> {
      const rules = db.prepare("SELECT * FROM filter_rule").all() as FilterRuleRow[];
      const allExisting = readJsonl(inFile);
      const seedItems = allExisting.filter((i: any) => !(i.payload as any)?.source_channel);
      const out: StageItem[] = [];
      const dropped: StageDropped[] = [];
      const errors: StageError[] = [];
      for (const item of items) {
        try {
          const candidate = item.payload as Candidate;
          if (!candidate.source_channel) {
            dropped.push({ item, reason: "not a candidate (seed data)" });
            continue;
          }
          const res = evaluateRules(candidate, rules);
          if (!res.pass) {
            const reason = res.reason ?? "filtered";
            dropped.push({ item, reason });
            if (!ctx.dryRun) appendJsonl(errorFile, { ...item, _reason: reason, _run_id: ctx.run_id, _at: new Date().toISOString() });
            continue;
          }
          const entry: StageHistoryEntry = {
            stage_id: "filter", run_id: ctx.run_id, status: "success",
            at: new Date().toISOString(),
          };
          const next: StageItem = {
            ...item,
            _pipeline: {
              ...item._pipeline,
              stage_history: [...item._pipeline.stage_history, entry],
            },
          };
          out.push(next);
        } catch (e) {
          const errMsg = String((e as Error).message ?? e);
          errors.push({ item, error: errMsg });
          if (!ctx.dryRun) appendJsonl(errorFile, { ...item, _error: errMsg, _run_id: ctx.run_id, _at: new Date().toISOString() });
        }
      }
      // Rewrite evolved/high_value.jsonl: keep seed data + ALL passed items (existing + newly passed)
      if (!ctx.dryRun) {
        const existingPassed = allExisting.filter((i: any) => {
          const history = i._pipeline?.stage_history ?? [];
          return history.some((h: any) => h.stage_id === "filter");
        });
        const dest: unknown[] = [...seedItems, ...existingPassed, ...out];
        writeFileSync(outFile, dest.map(o => JSON.stringify(o)).join("\n") + "\n", "utf-8");
      }
      return { out, dropped, errors };
    },
  };
}
