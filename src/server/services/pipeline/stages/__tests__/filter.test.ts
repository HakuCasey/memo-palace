import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "../../../../db/schema.js";
import { createFilterStage } from "../filter.js";
import { appendJsonl } from "../../helpers/jsonl.js";

let root: string;
let db: Database.Database;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "memo-filter-"));
  mkdirSync(join(root, "evolved"), { recursive: true });
  mkdirSync(join(root, "filter"), { recursive: true });
  db = new Database(":memory:");
  initSchema(db);
});

const cand = (id: string, over: Record<string, unknown>) => ({
  id,
  payload: {
    id, source_channel: "huawei_forum", source_file: "f", created_at: "2026", title: "T", tags: [],
    question: "Q", answer: "A",
    _pipeline: { source_file: "f", stage_history: [] },
    ...over,
  },
  _pipeline: { source_file: "f", stage_history: [] },
});

const ctx = { run_id: "pr_x", trigger: "manual" as const, logger: { info(){}, warn(){}, error(){} } };

describe("filter stage with rules", () => {
  it("drops items failing min_length rule on _main_text", async () => {
    db.prepare(`INSERT INTO filter_rule (id,name,field,operator,value_json,enabled,priority,mode,created_at,updated_at) VALUES ('fr_1','len','_main_text','min_length','100',1,0,'include',?,?)`).run("now","now");
    const candFile = join(root, "evolved", "high_value.jsonl");
    appendJsonl(candFile, cand("cand_short", { answer: "x" }));
    appendJsonl(candFile, cand("cand_long", { answer: "x".repeat(200) }));

    const stage = createFilterStage(db, join(root, "evolved"), join(root, "filter"));
    const items = await stage.inputs();
    const result = await stage.run(items, ctx);
    expect(result.out.map(i => i.id)).toEqual(["cand_long"]);
    expect(result.dropped.map(d => d.item.id)).toEqual(["cand_short"]);
  });

  it("with no rules, keeps everything", async () => {
    const candFile = join(root, "evolved", "high_value.jsonl");
    appendJsonl(candFile, cand("cand_any", {}));
    const stage = createFilterStage(db, join(root, "evolved"), join(root, "filter"));
    const items = await stage.inputs();
    const result = await stage.run(items, ctx);
    expect(result.out.length).toBe(1);
  });
});
