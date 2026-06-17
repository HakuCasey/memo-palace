import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { StageError } from "../types.js";

function file(stageDir: string, runId: string): string {
  return join(stageDir, ".errors", `${runId}.jsonl`);
}

export function writeErrors(stageDir: string, runId: string, errors: StageError[]): void {
  const f = file(stageDir, runId);
  mkdirSync(join(stageDir, ".errors"), { recursive: true });
  writeFileSync(f, errors.map(e => JSON.stringify(e)).join("\n") + (errors.length ? "\n" : ""), "utf-8");
}

export function readErrors(stageDir: string, runId: string): StageError[] {
  const f = file(stageDir, runId);
  if (!existsSync(f)) return [];
  const text = readFileSync(f, "utf-8");
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as StageError);
}

export function clearErrors(stageDir: string, runId: string): void {
  const f = file(stageDir, runId);
  if (existsSync(f)) rmSync(f, { force: true });
}

export function summarizeErrors(errors: StageError[]): { total: number; sample: StageError[] } {
  return { total: errors.length, sample: errors.slice(0, 50) };
}
