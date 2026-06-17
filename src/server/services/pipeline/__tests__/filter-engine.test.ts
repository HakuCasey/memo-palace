import { describe, it, expect } from "vitest";
import { evaluateRules } from "../filter-engine.js";
import type { FilterRuleRow } from "../filter-engine.js";
import type { Candidate } from "../candidate-types.js";

const huawei = (over: Partial<Candidate>): Candidate => ({
  id: "cand_1", source_channel: "huawei_forum", source_file: "x.jsonl",
  created_at: "2026-01-01T00:00:00Z", title: "T", tags: [],
  question: "Q", answer: "A".repeat(200),
  _pipeline: { source_file: "x", stage_history: [] },
  ...over,
} as Candidate);

const rule = (over: Partial<FilterRuleRow>): FilterRuleRow => ({
  id: "r1", name: "r", field: "title", operator: "not_empty",
  value_json: null, enabled: 1, priority: 0, mode: "include",
  created_at: "", updated_at: "", ...over,
});

describe("filter engine", () => {
  it("not_empty include keeps when field non-empty, drops otherwise", () => {
    expect(evaluateRules(huawei({}), [rule({})]).pass).toBe(true);
    expect(evaluateRules(huawei({ title: "" }), [rule({})]).pass).toBe(false);
  });

  it("min_length on answer evaluates length", () => {
    const r = rule({ field: "answer", operator: "min_length", value_json: "100" });
    expect(evaluateRules(huawei({ answer: "short" }), [r]).pass).toBe(false);
    expect(evaluateRules(huawei({ answer: "x".repeat(150) }), [r]).pass).toBe(true);
  });

  it("contains_any matches if any keyword found", () => {
    const r = rule({ field: "title", operator: "contains_any", value_json: '["bug","error"]' });
    expect(evaluateRules(huawei({ title: "found bug in code" }), [r]).pass).toBe(true);
    expect(evaluateRules(huawei({ title: "general note" }), [r]).pass).toBe(false);
  });

  it("contains_all requires every keyword", () => {
    const r = rule({ field: "title", operator: "contains_all", value_json: '["api","timeout"]' });
    expect(evaluateRules(huawei({ title: "api request timeout" }), [r]).pass).toBe(true);
    expect(evaluateRules(huawei({ title: "api ok" }), [r]).pass).toBe(false);
  });

  it("regex matches a pattern", () => {
    const r = rule({ field: "answer", operator: "regex", value_json: '"```"' });
    expect(evaluateRules(huawei({ answer: "code:\n```ts\nx\n```" }), [r]).pass).toBe(true);
    expect(evaluateRules(huawei({ answer: "no code" }), [r]).pass).toBe(false);
  });

  it("exclude mode drops when matched", () => {
    const r = rule({ field: "title", operator: "contains_any", value_json: '["spam"]', mode: "exclude" });
    expect(evaluateRules(huawei({ title: "this is spam" }), [r]).pass).toBe(false);
    expect(evaluateRules(huawei({ title: "ham" }), [r]).pass).toBe(true);
  });

  it("disabled rules are ignored", () => {
    const r = rule({ field: "title", operator: "not_empty", enabled: 0 });
    expect(evaluateRules(huawei({ title: "" }), [r]).pass).toBe(true);
  });

  it("higher priority runs first (exclude wins early)", () => {
    const incl = rule({ id: "r1", field: "title", operator: "not_empty", priority: 1 });
    const excl = rule({ id: "r2", field: "title", operator: "contains_any", value_json: '["x"]', mode: "exclude", priority: 10 });
    const c = huawei({ title: "x" });
    expect(evaluateRules(c, [incl, excl]).pass).toBe(false);
  });
});
