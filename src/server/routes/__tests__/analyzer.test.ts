import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSchema } from "../../db/schema.js";
import { analyzerRoutes } from "../analyzer.js";
import type { PipelinePaths } from "../../services/pipeline/bootstrap.js";

let root: string;
let app: ReturnType<typeof Fastify>;
let db: Database.Database;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "memo-an-"));
  mkdirSync(join(root, "sources/manual"), { recursive: true });
  writeFileSync(join(root, "sources/manual/x.txt"), "hi");
  db = new Database(":memory:");
  initSchema(db);
  app = Fastify();
  const paths: PipelinePaths = { sourcesRoot: join(root, "sources"), normalizerDir: "", filterDir: "", evolvedDir: "", memoryRoot: "" };
  await analyzerRoutes(app, db, paths);
  await app.ready();
});

describe("analyzer routes", () => {
  it("GET /api/sources returns grouped files", async () => {
    const r = await app.inject({ method: "GET", url: "/api/sources" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Array<{ channel: string; files: unknown[] }>;
    expect(body.find(c => c.channel === "manual")?.files.length).toBe(1);
  });

  it("rules CRUD: POST then GET returns it", async () => {
    const create = await app.inject({ method: "POST", url: "/api/analyzer/rules", payload: {
      name: "test", field: "title", operator: "not_empty", value: null, mode: "include", priority: 5,
    }});
    expect(create.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/api/analyzer/rules" });
    expect((list.json() as unknown[]).length).toBe(1);
  });

  it("PATCH updates and DELETE removes", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/analyzer/rules", payload: {
      name: "a", field: "title", operator: "not_empty",
    }})).json() as { id: string };
    const patch = await app.inject({ method: "PATCH", url: `/api/analyzer/rules/${created.id}`, payload: { name: "b", enabled: 0 } });
    expect(patch.statusCode).toBe(200);
    const del = await app.inject({ method: "DELETE", url: `/api/analyzer/rules/${created.id}` });
    expect(del.statusCode).toBe(200);
    const list = (await app.inject({ method: "GET", url: "/api/analyzer/rules" })).json() as unknown[];
    expect(list.length).toBe(0);
  });

  it("POST /reorder updates priorities by array order", async () => {
    const a = (await app.inject({ method: "POST", url: "/api/analyzer/rules", payload: { name: "a", field: "title", operator: "not_empty" } })).json() as { id: string };
    const b = (await app.inject({ method: "POST", url: "/api/analyzer/rules", payload: { name: "b", field: "title", operator: "not_empty" } })).json() as { id: string };
    await app.inject({ method: "POST", url: "/api/analyzer/rules/reorder", payload: { ids: [b.id, a.id] } });
    const list = (await app.inject({ method: "GET", url: "/api/analyzer/rules" })).json() as Array<{ id: string; priority: number }>;
    expect(list[0].id).toBe(b.id);
    expect(list[0].priority).toBeGreaterThan(list[1].priority);
  });
});
