import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { listStages, getStage } from "../services/pipeline/registry.js";
import { runStage } from "../services/pipeline/runner.js";
import { addToSkiplist, removeFromJsonl, readJsonl } from "../services/pipeline/helpers/jsonl.js";
import { readErrors, clearErrors } from "../services/pipeline/helpers/errors.js";
import { setSourceFileFilter } from "../services/pipeline/stages/normalizer.js";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

function candHash(parts: string[]): string {
  return "cand_" + createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 8);
}

interface PipelineRunRow {
  run_id: string;
  stage_id: string;
}

export async function pipelineRoutes(app: FastifyInstance, db: Database.Database, pipelineDirs: Record<string,string>, sourcesRoot: string): Promise<void> {
  app.get("/api/pipeline/stages", async () => {
    const stages = listStages();
    return stages.map(s => ({
      stage_id: s.id,
      runs: db.prepare("SELECT * FROM pipeline_run WHERE stage_id = ? ORDER BY started_at DESC").all(s.id),
    }));
  });

  app.get("/api/pipeline/stages/:stage_id/items", async (req) => {
    const { stage_id } = req.params as { stage_id: string };
    const items = await getStage(stage_id).inputs();
    return { items: items.slice(0, 500), total: items.length };
  });

  app.post("/api/pipeline/stages/:stage_id/run", async (req, reply) => {
    const { stage_id } = req.params as { stage_id: string };
    const body = (req.body ?? {}) as { ids?: string[]; dryRun?: boolean };
    const running = db.prepare("SELECT run_id FROM pipeline_run WHERE stage_id = ? AND status = 'running' LIMIT 1").get(stage_id) as { run_id: string } | undefined;
    if (running) {
      reply.code(409);
      return { error: `stage ${stage_id} is currently running`, run_id: running.run_id };
    }
    const row = await runStage(db, stage_id, { trigger: "manual", inputIds: body.ids, dryRun: body.dryRun });
    return row;
  });

  app.post("/api/pipeline/runs/:run_id/retry", async (req, reply) => {
    const { run_id } = req.params as { run_id: string };
    const prev = db.prepare("SELECT * FROM pipeline_run WHERE run_id = ?").get(run_id) as PipelineRunRow | undefined;
    if (!prev) { reply.code(404); return { error: "run not found" }; }
    const stageDir = pipelineDirs[prev.stage_id];
    if (!stageDir) { reply.code(400); return { error: "no stage dir mapped" }; }
    const errs = readErrors(stageDir, run_id);
    if (!errs.length) return { skipped: true, reason: "no errors to retry" };
    const ids = errs.map((e: any) => e.item.id);
    const row = await runStage(db, prev.stage_id, { trigger: "retry", inputIds: ids });
    return row;
  });

  app.post("/api/pipeline/stages/:stage_id/ignore", async (req) => {
    const { stage_id } = req.params as { stage_id: string };
    const { ids } = req.body as { ids: string[] };
    const dir = pipelineDirs[stage_id];
    addToSkiplist(join(dir, ".skiplist.json"), ids);
    return { ignored: ids.length };
  });

  app.delete("/api/pipeline/runs/:run_id/errors", async (req) => {
    const { run_id } = req.params as { run_id: string };
    const prev = db.prepare("SELECT stage_id FROM pipeline_run WHERE run_id = ?").get(run_id) as { stage_id: string } | undefined;
    if (!prev) return { cleared: false };
    const dir = pipelineDirs[prev.stage_id];
    if (dir) clearErrors(dir, run_id);
    return { cleared: true };
  });

  app.post("/api/pipeline/run-all", async () => {
    const order = ["normalizer", "filter"];
    const run_ids: Record<string,string> = {};
    for (const sid of order) {
      const row = await runStage(db, sid, { trigger: "manual" });
      run_ids[sid] = row.run_id;
      if (row.status === "failed") break;
    }
    return { run_ids };
  });

  app.post("/api/pipeline/batch-run", async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: string[] };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      reply.code(400);
      return { error: "ids[] required" };
    }
    const order = ["normalizer", "filter"];
    const run_ids: Record<string, string> = {};
    setSourceFileFilter(body.ids);
    try {
      for (const sid of order) {
        const opts: { trigger: "manual"; inputIds?: string[] } = { trigger: "manual" };
        if (sid === "filter" && run_ids.normalizer) {
          const inputIdsJson = (db.prepare("SELECT input_ids_json FROM pipeline_run WHERE run_id = ?").get(run_ids.normalizer) as { input_ids_json: string } | undefined)?.input_ids_json;
          if (inputIdsJson) {
            try { opts.inputIds = JSON.parse(inputIdsJson) as string[]; } catch { /* ignore */ }
          }
        }
        const row = await runStage(db, sid, opts);
        run_ids[sid] = row.run_id;
        if (row.status === "failed") break;
      }
    } finally {
      setSourceFileFilter(null);
    }

    // Post-evolution: split evolved entries from source files
    const evolvedFiles: string[] = [];
    if (run_ids.filter && db.prepare("SELECT status FROM pipeline_run WHERE run_id = ?").get(run_ids.filter) as any) {
      const hvFile = join(pipelineDirs.evolved, "high_value.jsonl");
      const hvIds = new Set<string>(readJsonl(hvFile).map((i: any) => i.id));
      for (const sfId of body.ids) {
        const srcPath = join(sourcesRoot, sfId);
        if (!existsSync(srcPath)) continue;
        const raw = readFileSync(srcPath, "utf-8").split(/\r?\n/).filter(Boolean);
        const evolved: string[] = [];
        const pending: string[] = [];
        const ext = sfId.includes("manual") ? "" : sfId;
        const channel = sfId.split(/[\\/]/)[0];
        for (let i = 0; i < raw.length; i++) {
          let rawId: string;
          try {
            const obj = JSON.parse(raw[i]);
            rawId = obj.id ?? String(i);
          } catch {
            rawId = String(i);
          }
          const cid = candHash([sfId, channel, rawId]);
          if (hvIds.has(cid)) evolved.push(raw[i]);
          else pending.push(raw[i]);
        }
        if (evolved.length > 0) {
          const base = sfId.replace(/\.[^.]+$/, "");
          const evolvedPath = join(sourcesRoot, `${base}_evolved.jsonl`);
          writeFileSync(evolvedPath, evolved.join("\n") + "\n", "utf-8");
          writeFileSync(srcPath, pending.join("\n") + (pending.length > 0 ? "\n" : ""), "utf-8");
          evolvedFiles.push(sfId);
        }
      }
    }

    return { run_ids, evolved_files: evolvedFiles };
  });

  app.get("/api/pipeline/artifacts/:bucket", async (req, reply) => {
    const { bucket } = req.params as { bucket: string };
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(q.limit ?? "200", 10), 1000);
    const offset = parseInt(q.offset ?? "0", 10);
    let file: string;
    if (bucket === "normalizer") { file = join(pipelineDirs.normalizer, "normalized_error.jsonl"); }
    else if (bucket === "filter") { file = join(pipelineDirs.filter, "filtered_error.jsonl"); }
    else if (bucket === "evolved") { file = join(pipelineDirs.evolved, "high_value.jsonl"); }
    else { reply.code(404); return { error: "unknown bucket" }; }
    const items = await import("../services/pipeline/helpers/jsonl.js").then(m => m.readJsonl(file));
    const normalized = items.map((i: any) => {
      if (i.payload?.source_channel) return i;
      if (i.dc_id) {
        return {
          id: i.dc_id,
          payload: {
            source_channel: "manual" as const,
            title: i.title ?? "",
            tags: Array.isArray(i.tags) ? i.tags : [],
            content: [i.symptom, i.root_cause, i.fix].filter(Boolean).join("\n---\n"),
          },
        };
      }
      return null;
    }).filter(Boolean);
    return { items: normalized.slice(offset, offset + limit), total: normalized.length };
  });

  app.delete("/api/pipeline/artifacts/:bucket", async (req, reply) => {
    const { bucket } = req.params as { bucket: string };
    const q = req.query as { ids?: string };
    const ids = q.ids?.split(",").filter(Boolean) ?? [];
    if (!ids.length) { reply.code(400); return { error: "ids required" }; }
    let file: string;
    if (bucket === "evolved") { file = join(pipelineDirs.evolved, "high_value.jsonl"); }
    else if (bucket === "normalizer") { file = join(pipelineDirs.normalizer, "normalized_error.jsonl"); }
    else if (bucket === "filter") { file = join(pipelineDirs.filter, "filtered_error.jsonl"); }
    else { reply.code(404); return { error: "unknown bucket" }; }
    const { readFileSync: rf, writeFileSync: wf } = await import("node:fs");
    const lines = rf(file, "utf-8").split(/\r?\n/).filter(Boolean);
    const idSet = new Set(ids);
    const kept = lines.filter(l => {
      try { const o = JSON.parse(l); return !idSet.has(o.id || o.dc_id); } catch { return true; }
    });
    wf(file, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf-8");
    return { removed: ids.length };
  });

  app.post("/api/pipeline/clear-all", async (req, reply) => {
    const body = (req.body ?? {}) as { confirm?: boolean };
    if (!body.confirm) { reply.code(400); return { error: "confirm:true required" }; }
    const { writeFileSync } = await import("node:fs");
    const files = [
      join(pipelineDirs.normalizer, "normalized_error.jsonl"),
      join(pipelineDirs.filter, "filtered_error.jsonl"),
    ];
    for (const f of files) {
      try { writeFileSync(f, "", "utf-8"); } catch { /* ignore */ }
    }
    const info = db.prepare("DELETE FROM pipeline_run").run();
    return { cleared: true, runs_deleted: info.changes };
  });

  app.post("/api/pipeline/revert", async (req, reply) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) { reply.code(400); return { error: "ids[] required" }; }
    const { readFileSync: rf, writeFileSync: wf, existsSync: ex, appendFileSync: af, unlinkSync: ul } = await import("node:fs");
    const { dirname, join: j } = await import("node:path");
    const reverted: string[] = [];
    for (const sfId of ids) {
      const srcPath = j(sourcesRoot, sfId);
      if (!ex(srcPath)) continue;
      const base = sfId.replace(/\.[^.]+$/, "");
      const evolvedPath = j(sourcesRoot, `${base}_evolved.jsonl`);
      if (!ex(evolvedPath)) continue;
      const evolvedContent = rf(evolvedPath, "utf-8").trim();
      if (evolvedContent.length > 0) {
        const srcContent = rf(srcPath, "utf-8").trim();
        const merged = srcContent.length > 0 ? srcContent + "\n" + evolvedContent : evolvedContent;
        wf(srcPath, merged + "\n", "utf-8");
      }
      ul(evolvedPath);
      const hvFile = j(pipelineDirs.evolved, "high_value.jsonl");
      if (ex(hvFile)) {
        const channel = sfId.split(/[\\/]/)[0];
        const rawLines = rf(hvFile, "utf-8").split(/\r?\n/).filter(Boolean);
        const kept = rawLines.filter(l => {
          try { const o = JSON.parse(l); return o.payload?.source_file !== sfId; } catch { return true; }
        });
        wf(hvFile, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf-8");
      }
      reverted.push(sfId);
    }
    return { reverted };
  });

  app.get("/api/pipeline/runs", async (req) => {
    const q = req.query as { stage_id?: string; status?: string; limit?: string; offset?: string };
    const limit = Math.min(parseInt(q.limit ?? "50", 10), 500);
    const offset = parseInt(q.offset ?? "0", 10);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.stage_id) { where.push("stage_id = ?"); params.push(q.stage_id); }
    if (q.status)   { where.push("status = ?");   params.push(q.status); }
    const sql = `SELECT * FROM pipeline_run ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY started_at DESC LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...params, limit, offset);
    return { rows, limit, offset };
  });

  app.get("/api/pipeline/runs/:run_id", async (req, reply) => {
    const { run_id } = req.params as { run_id: string };
    const row = db.prepare("SELECT * FROM pipeline_run WHERE run_id = ?").get(run_id);
    if (!row) { reply.code(404); return { error: "not found" }; }
    return row;
  });

  app.get("/api/pipeline/runs/stats", async () => {
    const { c } = db.prepare("SELECT COUNT(*) c FROM pipeline_run").get() as { c: number };
    return { total: c, threshold: 5000, over_threshold: c > 5000 };
  });

  app.delete("/api/pipeline/runs", async (req, reply) => {
    const body = (req.body ?? {}) as { before?: string; stage_id?: string; status?: string; confirm?: boolean };
    if (!body.confirm) { reply.code(400); return { error: "confirm:true required" }; }
    const where: string[] = [];
    const params: unknown[] = [];
    if (body.before)   { where.push("started_at < ?"); params.push(body.before); }
    if (body.stage_id) { where.push("stage_id = ?"); params.push(body.stage_id); }
    if (body.status)   { where.push("status = ?"); params.push(body.status); }
    const sql = `DELETE FROM pipeline_run ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    const info = db.prepare(sql).run(...params);
    return { deleted: info.changes };
  });
}
