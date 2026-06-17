import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSources } from "../sources.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "memo-srcs-"));
  mkdirSync(join(root, "huawei_forum"), { recursive: true });
  mkdirSync(join(root, "manual"), { recursive: true });
  writeFileSync(join(root, "huawei_forum/raw_1.jsonl"), JSON.stringify({}) + "\n" + JSON.stringify({}) + "\n");
  writeFileSync(join(root, "manual/note.txt"), "hi");
});

describe("listSources", () => {
  it("groups files by channel with item count", () => {
    const out = listSources(root);
    const huawei = out.find(c => c.channel === "huawei_forum");
    const manual = out.find(c => c.channel === "manual");
    expect(huawei?.files[0]).toMatchObject({ name: "raw_1.jsonl", count: 2 });
    expect(manual?.files[0]).toMatchObject({ name: "note.txt", count: 1 });
  });
});
