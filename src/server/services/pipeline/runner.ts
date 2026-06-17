import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { getStage } from "./registry.js";
import { summarizeErrors } from "./helpers/errors.js";
import type { StageItem } from "./types.js";

export interface RunOptions {
  trigger: "manual" | "schedule" | "retry";
  inputIds?: string[];
  dryRun?: boolean;
}

export interface RunRow {
  run_id: string;
  stage_id: string;
  trigger: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  in_count: number;
  out_count: number;
  dropped_count: number;
  error_count: number;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  error_message?: string;
  errors_json?: string;
  input_ids_json?: string;
  notes?: string;
}

function generateRunId(stageId: string): string {
  const date = new Date().toISOString().slice(0,10).replace(/-/g,"");
  const hash = createHash("sha256").update(stageId + Date.now() + Math.random()).digest("hex").slice(0,6);
  return `pr_${date}_${hash}`;
}

export async function runStage(db: Database.Database, stageId: string, opts: RunOptions): Promise<RunRow> {
  const stage = getStage(stageId);
  const runId = generateRunId(stageId);
  const startedAt = new Date().toISOString();

  // overlap check
  const running = db.prepare(
    "SELECT run_id FROM pipeline_run WHERE stage_id = ? AND status = 'running' LIMIT 1"
  ).get(stageId) as { run_id: string } | undefined;
  if (running) {
    const row: RunRow = {
      run_id: runId, stage_id: stageId, trigger: opts.trigger,
      status: "skipped", in_count: 0, out_count: 0, dropped_count: 0, error_count: 0,
      started_at: startedAt, finished_at: startedAt, duration_ms: 0,
      error_message: `previous run still running: ${running.run_id}`,
    };
    insertRun(db, row);
    return row;
  }

  insertRun(db, {
    run_id: runId, stage_id: stageId, trigger: opts.trigger,
    status: "running", in_count: 0, out_count: 0, dropped_count: 0, error_count: 0,
    started_at: startedAt,
    input_ids_json: opts.inputIds ? JSON.stringify(opts.inputIds) : undefined,
    notes: opts.dryRun ? "dry-run" : undefined,
  });

  const t0 = Date.now();
  let items: StageItem[] = [];
  try {
    items = await stage.inputs();
    if (opts.inputIds) {
      const set = new Set(opts.inputIds);
      items = items.filter(i => set.has(i.id));
    }
    const ctx = {
      run_id: runId, trigger: opts.trigger, dryRun: opts.dryRun,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await stage.run(items, ctx);
    const status: RunRow["status"] =
      result.errors.length === 0 ? "success" :
      result.out.length > 0 ? "partial" : "failed";
    const update: Partial<RunRow> = {
      status,
      in_count: items.length,
      out_count: result.out.length,
      dropped_count: result.dropped.length,
      error_count: result.errors.length,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      errors_json: result.errors.length ? JSON.stringify(summarizeErrors(result.errors)) : undefined,
    };
    updateRun(db, runId, update);
    return { ...readRun(db, runId)! };
  } catch (e) {
    const update: Partial<RunRow> = {
      status: "failed",
      in_count: items.length,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      error_message: String((e as Error).message ?? e),
    };
    updateRun(db, runId, update);
    return { ...readRun(db, runId)! };
  }
}

function insertRun(db: Database.Database, row: Partial<RunRow> & Pick<RunRow,"run_id"|"stage_id"|"trigger"|"status"|"started_at">): void {
  db.prepare(`
    INSERT INTO pipeline_run (run_id, stage_id, trigger, status, in_count, out_count, dropped_count, error_count, started_at, finished_at, duration_ms, error_message, errors_json, input_ids_json, notes)
    VALUES (@run_id, @stage_id, @trigger, @status, @in_count, @out_count, @dropped_count, @error_count, @started_at, @finished_at, @duration_ms, @error_message, @errors_json, @input_ids_json, @notes)
  `).run({
    in_count: 0, out_count: 0, dropped_count: 0, error_count: 0,
    finished_at: null, duration_ms: null, error_message: null,
    errors_json: null, input_ids_json: null, notes: null,
    ...row,
  });
}

function updateRun(db: Database.Database, runId: string, patch: Partial<RunRow>): void {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const setSql = keys.map(k => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE pipeline_run SET ${setSql} WHERE run_id = @run_id`)
    .run({ ...patch, run_id: runId });
}

function readRun(db: Database.Database, runId: string): RunRow | undefined {
  return db.prepare("SELECT * FROM pipeline_run WHERE run_id = ?").get(runId) as RunRow | undefined;
}
