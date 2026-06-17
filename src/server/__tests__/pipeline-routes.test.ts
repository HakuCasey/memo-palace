import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema.js";
import { bootstrapPipeline, type PipelinePaths } from "../services/pipeline/bootstrap.js";
import { _clearTasksForTest } from "../services/pipeline/scheduler.js";
import { pipelineRoutes } from "../routes/pipeline.js";
import { scheduleRoutes } from "../routes/schedule.js";

interface BuiltApp {
  app: FastifyInstance;
  db: Database.Database;
  root: string;
}

function buildApp(): BuiltApp {
  const root = mkdtempSync(join(tmpdir(), "memo-routes-"));
  mkdirSync(join(root, "assets", "sources"), { recursive: true });
  mkdirSync(join(root, "assets", "pipeline", "normalizer"), { recursive: true });
  mkdirSync(join(root, "assets", "pipeline", "filter"), { recursive: true });
  mkdirSync(join(root, "memory"), { recursive: true });
  // Drop a real source file so normalizer has work to do.
  writeFileSync(join(root, "assets", "sources", "demo.txt"), "x".repeat(300));

  const paths: PipelinePaths = {
    sourcesRoot:   join(root, "assets/sources"),
    normalizerDir: join(root, "assets/pipeline/normalizer"),
    filterDir:     join(root, "assets/pipeline/filter"),
    evolvedDir:    join(root, "assets/pipeline/evolved"),
    memoryRoot:    join(root, "memory"),
  };

  const db = new Database(":memory:");
  initSchema(db);
  bootstrapPipeline(db, paths);

  const pipelineDirs: Record<string, string> = {
    normalizer: paths.normalizerDir,
    filter:     paths.filterDir,
    evolved:    paths.evolvedDir,
  };

  const app = Fastify();
  app.register(async (instance) => {
    await pipelineRoutes(instance, db, pipelineDirs, paths.sourcesRoot);
    await scheduleRoutes(instance, db);
  });
  return { app, db, root };
}

let built: BuiltApp;
beforeEach(async () => {
  built = buildApp();
  await built.app.ready();
});
afterEach(async () => {
  await built.app.close();
  built.db.close();
  _clearTasksForTest();
  try { rmSync(built.root, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("pipeline routes", () => {
  it("GET /api/pipeline/stages returns the 2 built-in stages", async () => {
    const r = await built.app.inject({ method: "GET", url: "/api/pipeline/stages" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Array<{ stage_id: string }>;
    expect(body.map(s => s.stage_id).sort()).toEqual(["filter","normalizer"]);
  });

  it("POST /api/pipeline/stages/normalizer/run with dryRun=true returns success", async () => {
    const r = await built.app.inject({
      method: "POST",
      url: "/api/pipeline/stages/normalizer/run",
      payload: { dryRun: true },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { status: string; stage_id: string };
    expect(body.status).toBe("success");
    expect(body.stage_id).toBe("normalizer");
  });

  it("concurrent POST to same stage returns 409", async () => {
    // Manually insert a running row to simulate an in-flight run.
    built.db.prepare(
      "INSERT INTO pipeline_run (run_id, stage_id, trigger, status, started_at) VALUES (?,?,?,?,?)"
    ).run("pr_fake_running", "normalizer", "manual", "running", new Date().toISOString());
    const r = await built.app.inject({
      method: "POST",
      url: "/api/pipeline/stages/normalizer/run",
      payload: {},
    });
    expect(r.statusCode).toBe(409);
  });
});

describe("schedule routes", () => {
  it("POST /api/schedule with invalid cron returns 400", async () => {
    const r = await built.app.inject({
      method: "POST",
      url: "/api/schedule",
      payload: { stage_id: "filter", cron: "not-a-cron", enabled: true },
    });
    expect(r.statusCode).toBe(400);
  });

  it("DELETE /api/pipeline/runs without confirm returns 400", async () => {
    const r = await built.app.inject({
      method: "DELETE",
      url: "/api/pipeline/runs",
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });
});
