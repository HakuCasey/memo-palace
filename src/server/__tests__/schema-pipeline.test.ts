import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema.js";

describe("pipeline schema", () => {
  it("creates pipeline_run table with required columns", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const cols = db.prepare("PRAGMA table_info(pipeline_run)").all() as Array<{ name: string }>;
    const names = cols.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining([
      "run_id","stage_id","trigger","status","in_count","out_count",
      "dropped_count","error_count","started_at","finished_at","duration_ms",
      "error_message","errors_json","input_ids_json","notes"
    ]));
  });

  it("creates pipeline_schedule table with unique stage_id", () => {
    const db = new Database(":memory:");
    initSchema(db);
    db.prepare("INSERT INTO pipeline_schedule (schedule_id, stage_id, cron, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run("ps_filter_aaa", "filter", "0 3 * * *", 1, "2026-05-30T00:00:00Z", "2026-05-30T00:00:00Z");
    expect(() =>
      db.prepare("INSERT INTO pipeline_schedule (schedule_id, stage_id, cron, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)")
        .run("ps_filter_bbb", "filter", "0 4 * * *", 1, "2026-05-30T00:00:00Z", "2026-05-30T00:00:00Z")
    ).toThrow();
  });
});
