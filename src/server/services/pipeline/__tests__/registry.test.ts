import { describe, it, expect, beforeEach } from "vitest";
import { registerStage, getStage, listStages, clearRegistry } from "../registry.js";
import type { PipelineStage } from "../types.js";

const fakeStage: PipelineStage = {
  id: "fake",
  inputs: async () => [],
  run: async () => ({ out: [], dropped: [], errors: [] }),
};

describe("pipeline registry", () => {
  beforeEach(() => clearRegistry());

  it("registers and retrieves a stage by id", () => {
    registerStage(fakeStage);
    expect(getStage("fake")).toBe(fakeStage);
  });

  it("lists all registered stages", () => {
    registerStage(fakeStage);
    expect(listStages().map(s => s.id)).toEqual(["fake"]);
  });

  it("throws when getting unknown stage", () => {
    expect(() => getStage("missing")).toThrow(/unknown stage/);
  });
});
