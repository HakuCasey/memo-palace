import type { Candidate } from "./candidate-types.js";
import { mainText } from "./candidate-types.js";

export type FilterOperator = "min_length" | "not_empty" | "contains_any" | "contains_all" | "regex";

export interface FilterRuleRow {
  id: string;
  name: string;
  field: string;
  operator: FilterOperator;
  value_json: string | null;
  enabled: number;
  priority: number;
  mode: "include" | "exclude";
  created_at: string;
  updated_at: string;
}

export interface EvalResult {
  pass: boolean;
  reason?: string;
}

function getField(c: Candidate, field: string): unknown {
  if (field === "_main_text") return mainText(c);
  return (c as unknown as Record<string, unknown>)[field];
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(" ");
  return String(v);
}

function evalOne(c: Candidate, r: FilterRuleRow): boolean {
  const v = getField(c, r.field);
  const raw = r.value_json != null ? (JSON.parse(r.value_json) as unknown) : undefined;
  switch (r.operator) {
    case "not_empty": {
      if (v == null) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }
    case "min_length": {
      const min = Number(raw);
      return asString(v).length >= min;
    }
    case "contains_any": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const s = asString(v);
      return arr.some(k => s.includes(k));
    }
    case "contains_all": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const s = asString(v);
      return arr.every(k => s.includes(k));
    }
    case "regex": {
      const re = new RegExp(String(raw));
      return re.test(asString(v));
    }
  }
}

export function evaluateRules(c: Candidate, rules: FilterRuleRow[]): EvalResult {
  const active = rules.filter(r => r.enabled === 1).sort((a, b) => b.priority - a.priority);
  for (const r of active) {
    const hit = evalOne(c, r);
    if (r.mode === "exclude" && hit) return { pass: false, reason: `excluded by rule: ${r.name}` };
    if (r.mode === "include" && !hit) return { pass: false, reason: `failed include rule: ${r.name}` };
  }
  return { pass: true };
}
