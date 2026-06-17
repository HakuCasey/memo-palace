import { describe, it, expect } from "vitest";
import { callLLM, NotImplementedError } from "../llm-hook.js";

describe("llm-hook", () => {
  it("throws NotImplementedError", async () => {
    await expect(callLLM("hi")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
