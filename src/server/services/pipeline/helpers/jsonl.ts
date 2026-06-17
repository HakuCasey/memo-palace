import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StageItem } from "../types.js";

export function readJsonl<T = StageItem>(file: string): T[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf-8");
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as T);
}

export function appendJsonl(file: string, item: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(item) + "\n", "utf-8");
}

export function readSkiplist(file: string): string[] {
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf-8")) as { ignored_ids?: string[] };
  return raw.ignored_ids ?? [];
}

export function addToSkiplist(file: string, ids: string[]): void {
  const current = new Set(readSkiplist(file));
  for (const id of ids) current.add(id);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ignored_ids: Array.from(current) }, null, 2), "utf-8");
}

export function removeFromJsonl(file: string, ids: Set<string>): number {
  if (!existsSync(file)) return 0;
  const all = readJsonl(file);
  const kept = all.filter(i => !ids.has(i.id));
  if (kept.length === all.length) return 0;
  mkdirSync(dirname(file), { recursive: true });
  if (kept.length === 0) {
    writeFileSync(file, "", "utf-8");
  } else {
    writeFileSync(file, kept.map(o => JSON.stringify(o)).join("\n") + "\n", "utf-8");
  }
  return all.length - kept.length;
}
