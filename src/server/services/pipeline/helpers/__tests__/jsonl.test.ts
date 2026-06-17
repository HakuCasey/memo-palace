import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonl, appendJsonl, readSkiplist, addToSkiplist } from "../jsonl.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memo-jsonl-"));
});

describe("jsonl helpers", () => {
  it("reads empty file as empty array", () => {
    const f = join(dir, "x.jsonl");
    writeFileSync(f, "");
    expect(readJsonl(f)).toEqual([]);
  });

  it("appends single line and reads back", () => {
    const f = join(dir, "x.jsonl");
    appendJsonl(f, { id: "a", payload: 1, _pipeline: { source_file: "s", stage_history: [] } });
    expect(readJsonl(f)).toHaveLength(1);
  });

  it("skiplist round-trip", () => {
    const f = join(dir, ".skiplist.json");
    expect(readSkiplist(f)).toEqual([]);
    addToSkiplist(f, ["a","b"]);
    addToSkiplist(f, ["b","c"]);
    expect(readSkiplist(f).sort()).toEqual(["a","b","c"]);
  });
});
