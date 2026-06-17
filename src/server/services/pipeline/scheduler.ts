import type Database from "better-sqlite3";
import cron, { type ScheduledTask } from "node-cron";
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runStage } from "./runner.js";

const tasks = new Map<string, ScheduledTask>();
let _sourcesRoot = "";

function sourcesChangedSince(sourcesRoot: string, since: string | null): boolean {
  if (!since) return true;
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return true;
  function walk(dir: string): boolean {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return false; }
    for (const e of entries) {
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (walk(full)) return true; }
      else if (st.isFile() && st.mtimeMs > sinceMs) return true;
    }
    return false;
  }
  return walk(sourcesRoot);
}

export interface ScheduleRow {
  schedule_id: string;
  stage_id: string;
  cron: string;
  enabled: number;
  last_run_id: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleInput {
  stage_id: string;
  cron: string;
  enabled: boolean;
}

function generateScheduleId(stageId: string, cronExpr: string): string {
  const hash = createHash("sha256").update(stageId + cronExpr).digest("hex").slice(0,6);
  return `ps_${stageId}_${hash}`;
}

export function upsertSchedule(db: Database.Database, input: ScheduleInput): ScheduleRow {
  if (!cron.validate(input.cron)) {
    throw new Error(`invalid cron expression: ${input.cron}`);
  }
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM pipeline_schedule WHERE stage_id = ?").get(input.stage_id) as ScheduleRow | undefined;
  const scheduleId = existing?.schedule_id ?? generateScheduleId(input.stage_id, input.cron);

  if (existing) {
    db.prepare("UPDATE pipeline_schedule SET cron = ?, enabled = ?, updated_at = ? WHERE schedule_id = ?")
      .run(input.cron, input.enabled ? 1 : 0, now, scheduleId);
  } else {
    db.prepare(`INSERT INTO pipeline_schedule (schedule_id, stage_id, cron, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
      .run(scheduleId, input.stage_id, input.cron, input.enabled ? 1 : 0, now, now);
  }

  rescheduleTask(db, scheduleId);
  return db.prepare("SELECT * FROM pipeline_schedule WHERE schedule_id = ?").get(scheduleId) as ScheduleRow;
}

export function removeSchedule(db: Database.Database, scheduleId: string): void {
  const existing = tasks.get(scheduleId);
  if (existing) { existing.stop(); tasks.delete(scheduleId); }
  db.prepare("DELETE FROM pipeline_schedule WHERE schedule_id = ?").run(scheduleId);
}

export function listSchedules(db: Database.Database): ScheduleRow[] {
  return db.prepare("SELECT * FROM pipeline_schedule ORDER BY stage_id").all() as ScheduleRow[];
}

export function loadSchedules(db: Database.Database, sourcesRoot: string): void {
  _sourcesRoot = sourcesRoot;
  for (const row of listSchedules(db)) {
    if (row.enabled) rescheduleTask(db, row.schedule_id);
  }
}

function rescheduleTask(db: Database.Database, scheduleId: string): void {
  const existing = tasks.get(scheduleId);
  if (existing) { existing.stop(); tasks.delete(scheduleId); }
  const row = db.prepare("SELECT * FROM pipeline_schedule WHERE schedule_id = ?").get(scheduleId) as ScheduleRow | undefined;
  if (!row || !row.enabled) return;
  const task = cron.schedule(row.cron, async () => {
    if (row.stage_id === "normalizer") {
      const last = db.prepare("SELECT MAX(finished_at) m FROM pipeline_run WHERE stage_id = 'normalizer' AND status IN ('success','partial')").get() as { m: string | null };
      if (!sourcesChangedSince(_sourcesRoot, last.m)) {
        db.prepare(`INSERT INTO pipeline_run (run_id, stage_id, trigger, status, in_count, out_count, dropped_count, error_count, started_at, finished_at, duration_ms, error_message) VALUES (?,?,?,?,0,0,0,0,?,?,0,?)`)
          .run(`pr_skip_${Date.now()}`, "normalizer", "schedule", "skipped", new Date().toISOString(), new Date().toISOString(), "no source changes");
        return;
      }
    }
    const run = await runStage(db, row.stage_id, { trigger: "schedule" });
    db.prepare("UPDATE pipeline_schedule SET last_run_id = ?, last_run_at = ? WHERE schedule_id = ?")
      .run(run.run_id, new Date().toISOString(), scheduleId);
  });
  tasks.set(scheduleId, task);
}

export function _clearTasksForTest(): void {
  for (const t of tasks.values()) t.stop();
  tasks.clear();
}
