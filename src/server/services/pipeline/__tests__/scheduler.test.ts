import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "../../../db/schema.js";
import { upsertSchedule, listSchedules, removeSchedule, _clearTasksForTest } from "../scheduler.js";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});
afterEach(() => {
  _clearTasksForTest();
});

describe("scheduler", () => {
  it("upserts a schedule and lists it", () => {
    upsertSchedule(db, { stage_id: "filter", cron: "0 3 * * *", enabled: true });
    const all = listSchedules(db);
    expect(all.length).toBe(1);
    expect(all[0].stage_id).toBe("filter");
  });

  it("rejects invalid cron", () => {
    expect(() => upsertSchedule(db, { stage_id: "filter", cron: "not-a-cron", enabled: true })).toThrow(/cron/i);
  });

  it("removes a schedule", () => {
    upsertSchedule(db, { stage_id: "filter", cron: "0 3 * * *", enabled: true });
    const id = listSchedules(db)[0].schedule_id;
    removeSchedule(db, id);
    expect(listSchedules(db).length).toBe(0);
  });
});
