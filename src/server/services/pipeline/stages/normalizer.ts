import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { appendJsonl, readSkiplist, readJsonl } from "../helpers/jsonl.js";
import type { PipelineStage, StageItem, StageResult, StageError, StageHistoryEntry } from "../types.js";
import type { Candidate, SourceChannel } from "../candidate-types.js";

let sourceFileFilter: Set<string> | null = null;
export function setSourceFileFilter(ids: string[] | null): void {
  sourceFileFilter = ids ? new Set(ids) : null;
}

interface RawHuawei {
  id?: string;
  title?: string;
  question?: string;
  answer?: string;
  tags?: string[];
  scraped_at?: string;
  source_url?: string;
}

function candId(parts: string[]): string {
  return "cand_" + createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 8);
}

function detectChannel(rel: string): SourceChannel | null {
  const top = rel.split(/[\\/]/)[0];
  if (top === "huawei_forum" || top === "opencode_sessions" || top === "manual" || top === "dev_trouble_shot") return top as SourceChannel;
  return null;
}

function parseHuaweiForum(file: string, rel: string): Candidate[] {
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const out: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    let r: RawHuawei;
    try { r = JSON.parse(lines[i]) as RawHuawei; } catch { continue; }
    out.push({
      id: candId([rel, "huawei_forum", r.id ?? String(i)]),
      source_channel: "huawei_forum",
      source_file: rel,
      created_at: r.scraped_at ?? new Date().toISOString(),
      title: r.title ?? "",
      tags: r.tags ?? [],
      source_url: r.source_url,
      question: r.question ?? "",
      answer: r.answer ?? "",
      _pipeline: { source_file: file, stage_history: [] },
    });
  }
  return out;
}

interface RawOpencode {
  id?: string;
  submitted_at?: string;
  title?: string;
  problem?: string;
  solution?: string;
  evidence?: string;
  tags?: string[];
  signals?: string[];
}

function parseOpencodeSession(file: string, rel: string): Candidate[] {
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const out: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    let r: RawOpencode;
    try { r = JSON.parse(lines[i]) as RawOpencode; } catch { continue; }
    out.push({
      id: candId([rel, "opencode_sessions", r.id ?? String(i)]),
      source_channel: "opencode_sessions",
      source_file: rel,
      created_at: r.submitted_at ?? new Date().toISOString(),
      title: r.title ?? "",
      tags: r.tags ?? [],
      problem: r.problem ?? "",
      solution: r.solution ?? "",
      evidence: r.evidence,
      signals: r.signals ?? [],
      _pipeline: { source_file: file, stage_history: [] },
    });
  }
  return out;
}

function parseManual(file: string, rel: string): Candidate[] {
  if (extname(file) !== ".txt") return [];
  const content = readFileSync(file, "utf-8");
  const title = basename(file, extname(file));
  return [{
    id: candId([rel, "manual"]),
    source_channel: "manual",
    source_file: rel,
    created_at: statSync(file).mtime.toISOString(),
    title,
    tags: [],
    content,
    _pipeline: { source_file: file, stage_history: [] },
  }];
}

function parseDevTroubleShot(file: string, rel: string): Candidate[] {
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const out: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    let r: RawOpencode;
    try { r = JSON.parse(lines[i]) as RawOpencode; } catch { continue; }
    out.push({
      id: candId([rel, "dev_trouble_shot", r.id ?? String(i)]),
      source_channel: "dev_trouble_shot",
      source_file: rel,
      created_at: r.submitted_at ?? new Date().toISOString(),
      title: r.title ?? "",
      tags: r.tags ?? [],
      problem: r.problem ?? "",
      solution: r.solution ?? "",
      evidence: r.evidence,
      signals: r.signals ?? [],
      _pipeline: { source_file: file, stage_history: [] },
    });
  }
  return out;
}

function walk(dir: string, onFile: (file: string) => void): void {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, onFile);
    else if (st.isFile()) onFile(full);
  }
}

export function createNormalizerStage(sourcesRoot: string, normalizerDir: string, evolvedDir: string): PipelineStage {
  const errorFile = join(normalizerDir, "normalized_error.jsonl");
  const skipFile = join(normalizerDir, ".skiplist.json");
  const outFile = join(evolvedDir, "high_value.jsonl");

  return {
    id: "normalizer",

    async inputs(): Promise<StageItem[]> {
      const skipped = new Set(readSkiplist(skipFile));
      const existing = new Set(readJsonl(outFile).map(i => i.id));
      const items: StageItem[] = [];
      walk(sourcesRoot, (file) => {
        const rel = relative(sourcesRoot, file).replace(/\\/g, "/");
        if (rel.includes("_evolved")) return;
        if (sourceFileFilter && !sourceFileFilter.has(rel)) return;
        const channel = detectChannel(rel);
        if (!channel) return;
        let candidates: Candidate[] = [];
        if (channel === "huawei_forum") candidates = parseHuaweiForum(file, rel);
        if (channel === "opencode_sessions") candidates = parseOpencodeSession(file, rel);
        if (channel === "manual") candidates = parseManual(file, rel);
        if (channel === "dev_trouble_shot") candidates = parseDevTroubleShot(file, rel);
        for (const c of candidates) {
          if (skipped.has(c.id)) continue;
          if (existing.has(c.id)) continue;
          items.push({ id: c.id, payload: c, _pipeline: c._pipeline });
        }
      });
      return items;
    },

    async run(items, ctx): Promise<StageResult> {
      const out: StageItem[] = [];
      const errors: StageError[] = [];
      for (const item of items) {
        try {
          const historyEntry: StageHistoryEntry = {
            stage_id: "normalizer", run_id: ctx.run_id, status: "success",
            at: new Date().toISOString(),
          };
          const next: StageItem = {
            ...item,
            _pipeline: {
              ...item._pipeline,
              stage_history: [...item._pipeline.stage_history, historyEntry],
            },
          };
          if (!ctx.dryRun) appendJsonl(outFile, next);
          out.push(next);
        } catch (e) {
          const errMsg = String((e as Error).message ?? e);
          errors.push({ item, error: errMsg });
          if (!ctx.dryRun) appendJsonl(errorFile, { ...item, _error: errMsg, _run_id: ctx.run_id, _at: new Date().toISOString() });
        }
      }
      return { out, dropped: [], errors };
    },
  };
}
