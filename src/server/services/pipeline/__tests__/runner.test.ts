import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "../../../db/schema.js";
import { runStage } from "../runner.js";
import { registerStage, clearRegistry } from "../registry.js";
import type { PipelineStage, StageItem } from "../types.js";

const mkItem = (id: string): StageItem => ({
  id, payload: {}, _pipeline: { source_file: "x", stage_history: [] },
});

const fakeStage = (behaviour: "all-success" | "partial" | "throw"): PipelineStage => ({
  id: "fake_" + behaviour,
  inputs: async () => [mkItem("a"), mkItem("b"), mkItem("c")],
  run: async (items) => {
    if (behaviour === "throw") throw new Error("stage explode");
    if (behaviour === "partial") {
      return {
        out: [items[0]],
        dropped: [{ item: items[1], reason: "skip" }],
        errors: [{ item: items[2], error: "boom" }],
      };
    }
    return { out: items, dropped: [], errors: [] };
  },
});

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  clearRegistry();
});

describe("pipeline runner", () => {
  it("records success run", async () => {
    registerStage(fakeStage("all-success"));
    const run = await runStage(db, "fake_all-success", { trigger: "manual" });
    expect(run.status).toBe("success");
    expect(run.in_count).toBe(3);
    expect(run.out_count).toBe(3);
    expect(run.error_count).toBe(0);
  });

  it("records partial run", async () => {
    registerStage(fakeStage("partial"));
    const run = await runStage(db, "fake_partial", { trigger: "manual" });
    expect(run.status).toBe("partial");
    expect(run.error_count).toBe(1);
    expect(run.dropped_count).toBe(1);
  });

  it("records failed run when stage throws", async () => {
    registerStage(fakeStage("throw"));
    const run = await runStage(db, "fake_throw", { trigger: "manual" });
    expect(run.status).toBe("failed");
    expect(run.error_message).toMatch(/stage explode/);
  });

  it("skips when overlapping with running row", async () => {
    db.prepare(
      "INSERT INTO pipeline_run (run_id, stage_id, trigger, status, started_at) VALUES (?,?,?,?,?)"
    ).run("pr_existing", "fake_all-success", "manual", "running", new Date().toISOString());
    registerStage(fakeStage("all-success"));
    const run = await runStage(db, "fake_all-success", { trigger: "schedule" });
    expect(run.status).toBe("skipped");
    expect(run.error_message).toMatch(/previous run/);
  });
});
