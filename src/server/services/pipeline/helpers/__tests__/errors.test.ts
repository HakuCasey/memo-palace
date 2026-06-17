import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeErrors, readErrors, clearErrors, summarizeErrors } from "../errors.js";
import type { StageError } from "../../types.js";

const sample = (id: string): StageError => ({
  item: { id, payload: {}, _pipeline: { source_file: "x", stage_history: [] } },
  error: "boom",
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "memo-err-")); });

describe("errors helpers", () => {
  it("write and read errors round-trip", () => {
    writeErrors(dir, "pr_x", [sample("a"), sample("b")]);
    expect(readErrors(dir, "pr_x")).toHaveLength(2);
  });

  it("summarize caps detailed list at 50", () => {
    const errs = Array.from({ length: 120 }, (_, i) => sample("id" + i));
    const sum = summarizeErrors(errs);
    expect(sum.total).toBe(120);
    expect(sum.sample.length).toBe(50);
  });

  it("clear removes the file", () => {
    writeErrors(dir, "pr_x", [sample("a")]);
    clearErrors(dir, "pr_x");
    expect(readErrors(dir, "pr_x")).toEqual([]);
  });
});
