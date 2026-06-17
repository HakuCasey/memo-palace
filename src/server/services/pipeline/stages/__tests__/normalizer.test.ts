import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNormalizerStage } from "../normalizer.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "memo-normalizer-"));
  mkdirSync(join(root, "sources/huawei_forum"), { recursive: true });
  mkdirSync(join(root, "normalizer"), { recursive: true });
  mkdirSync(join(root, "evolved"), { recursive: true });
});

describe("normalizer stage", () => {
  it("parses huawei_forum jsonl into HuaweiForumCandidate", async () => {
    const file = join(root, "sources/huawei_forum/raw_001.jsonl");
    writeFileSync(file, JSON.stringify({
      id: "hm_raw_1",
      source: "huawei_forum",
      source_url: "https://example.com/x",
      scraped_at: "2026-05-22T07:39:49.127Z",
      title: "How to get weather",
      question: "How do I get weather data",
      answer: "Use weather kit ...",
      tags: ["Weather"]
    }) + "\n");

    const stage = createNormalizerStage(join(root, "sources"), join(root, "normalizer"), join(root, "evolved"));
    const items = await stage.inputs();
    expect(items.length).toBe(1);
    const result = await stage.run(items, { run_id: "pr_x", trigger: "manual", logger: { info(){}, warn(){}, error(){} } });
    expect(result.out.length).toBe(1);
    const payload = result.out[0].payload as { source_channel: string; title: string; question: string; answer: string; tags: string[]; source_url?: string };
    expect(payload.source_channel).toBe("huawei_forum");
    expect(payload.title).toBe("How to get weather");
    expect(payload.question).toBe("How do I get weather data");
    expect(payload.answer).toBe("Use weather kit ...");
    expect(payload.tags).toEqual(["Weather"]);
    expect(payload.source_url).toBe("https://example.com/x");
  });

  it("parses opencode_sessions jsonl into OpencodeSessionCandidate", async () => {
    mkdirSync(join(root, "sources/opencode_sessions"), { recursive: true });
    const file = join(root, "sources/opencode_sessions/sub.jsonl");
    writeFileSync(file, JSON.stringify({
      id: "sub_1",
      submitted_at: "2026-05-25T12:06:24.645Z",
      title: "hvigor signing fail",
      problem: "Failed to find signature file",
      solution: "Use relative path",
      evidence: "log...",
      tags: [],
      signals: ["hvigor_build_fail"],
    }) + "\n");

    const stage = createNormalizerStage(join(root, "sources"), join(root, "normalizer"), join(root, "evolved"));
    const items = await stage.inputs();
    const result = await stage.run(items, { run_id: "pr_x", trigger: "manual", logger: { info(){}, warn(){}, error(){} } });
    const payload = result.out[0].payload as { source_channel: string; problem: string; solution: string; signals: string[] };
    expect(payload.source_channel).toBe("opencode_sessions");
    expect(payload.problem).toBe("Failed to find signature file");
    expect(payload.solution).toBe("Use relative path");
    expect(payload.signals).toEqual(["hvigor_build_fail"]);
  });

  it("parses manual .txt into ManualCandidate using filename as title", async () => {
    mkdirSync(join(root, "sources/manual"), { recursive: true });
    writeFileSync(join(root, "sources/manual/note_abc.txt"), "Just some plain text note.");

    const stage = createNormalizerStage(join(root, "sources"), join(root, "normalizer"), join(root, "evolved"));
    const items = await stage.inputs();
    const result = await stage.run(items, { run_id: "pr_x", trigger: "manual", logger: { info(){}, warn(){}, error(){} } });
    const payload = result.out[0].payload as { source_channel: string; title: string; content: string };
    expect(payload.source_channel).toBe("manual");
    expect(payload.title).toBe("note_abc");
    expect(payload.content).toBe("Just some plain text note.");
  });

  it("skips already-produced candidates on rerun", async () => {
    mkdirSync(join(root, "sources/manual"), { recursive: true });
    writeFileSync(join(root, "sources/manual/x.txt"), "hello");

    const stage = createNormalizerStage(join(root, "sources"), join(root, "normalizer"), join(root, "evolved"));
    const items1 = await stage.inputs();
    await stage.run(items1, { run_id: "pr_1", trigger: "manual", logger: { info(){}, warn(){}, error(){} } });
    const items2 = await stage.inputs();
    expect(items2.length).toBe(0);
  });

  it("honors source-file filter (only emits items from listed files)", async () => {
    mkdirSync(join(root, "sources/manual"), { recursive: true });
    writeFileSync(join(root, "sources/manual/a.txt"), "hello world this is content");
    writeFileSync(join(root, "sources/manual/b.txt"), "another file with different stuff");

    const { createNormalizerStage, setSourceFileFilter } = await import("../normalizer.js");
    const stage = createNormalizerStage(join(root, "sources"), join(root, "normalizer"), join(root, "evolved"));
    setSourceFileFilter(["manual/a.txt"]);
    const items = await stage.inputs();
    setSourceFileFilter(null);
    expect(items.length).toBe(1);
    const p = items[0].payload as { source_file: string };
    expect(p.source_file).toBe("manual/a.txt");
  });
});
