import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { listSources } from "../services/sources.js";
import type { PipelinePaths } from "../services/pipeline/bootstrap.js";

interface RuleInput {
  name?: string;
  field?: string;
  operator?: string;
  value?: unknown;
  enabled?: boolean | number;
  priority?: number;
  mode?: "include" | "exclude";
}

function makeRuleId(name: string): string {
  return "fr_" + createHash("sha256").update(name + Date.now() + Math.random()).digest("hex").slice(0, 8);
}

export async function analyzerRoutes(app: FastifyInstance, db: Database.Database, paths: PipelinePaths): Promise<void> {
  app.get("/api/sources", async () => listSources(paths.sourcesRoot));

  app.get("/api/analyzer/rules", async () =>
    db.prepare("SELECT * FROM filter_rule ORDER BY priority DESC, name ASC").all()
  );

  app.post("/api/analyzer/rules", async (req, reply) => {
    const b = (req.body ?? {}) as RuleInput;
    if (!b.name || !b.field || !b.operator) { reply.code(400); return { error: "name/field/operator required" }; }
    const id = makeRuleId(b.name);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO filter_rule (id,name,field,operator,value_json,enabled,priority,mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.name, b.field, b.operator,
           b.value !== undefined && b.value !== null ? JSON.stringify(b.value) : null,
           b.enabled === false || b.enabled === 0 ? 0 : 1,
           b.priority ?? 0,
           b.mode ?? "include",
           now, now);
    return db.prepare("SELECT * FROM filter_rule WHERE id = ?").get(id);
  });

  app.patch("/api/analyzer/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as RuleInput;
    const existing = db.prepare("SELECT * FROM filter_rule WHERE id = ?").get(id);
    if (!existing) { reply.code(404); return { error: "not found" }; }
    const patches: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined)     { patches.push("name = ?");     params.push(b.name); }
    if (b.field !== undefined)    { patches.push("field = ?");    params.push(b.field); }
    if (b.operator !== undefined) { patches.push("operator = ?"); params.push(b.operator); }
    if (b.value !== undefined)    { patches.push("value_json = ?"); params.push(b.value === null ? null : JSON.stringify(b.value)); }
    if (b.enabled !== undefined)  { patches.push("enabled = ?");  params.push(b.enabled === false || b.enabled === 0 ? 0 : 1); }
    if (b.priority !== undefined) { patches.push("priority = ?"); params.push(b.priority); }
    if (b.mode !== undefined)     { patches.push("mode = ?");     params.push(b.mode); }
    patches.push("updated_at = ?"); params.push(new Date().toISOString());
    db.prepare(`UPDATE filter_rule SET ${patches.join(", ")} WHERE id = ?`).run(...params, id);
    return db.prepare("SELECT * FROM filter_rule WHERE id = ?").get(id);
  });

  app.delete("/api/analyzer/rules/:id", async (req) => {
    const { id } = req.params as { id: string };
    const info = db.prepare("DELETE FROM filter_rule WHERE id = ?").run(id);
    return { deleted: info.changes };
  });

  app.post("/api/analyzer/rules/reorder", async (req) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    if (!Array.isArray(ids)) return { error: "ids required" };
    const stmt = db.prepare("UPDATE filter_rule SET priority = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    const total = ids.length;
    db.transaction(() => {
      ids.forEach((id, idx) => stmt.run(total - idx, now, id));
    })();
    return { ok: true };
  });
}
