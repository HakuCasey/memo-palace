import type { PipelineStage } from "./types.js";

const registry = new Map<string, PipelineStage>();

export function registerStage(stage: PipelineStage): void {
  registry.set(stage.id, stage);
}

export function getStage(id: string): PipelineStage {
  const s = registry.get(id);
  if (!s) throw new Error(`unknown stage: ${id}`);
  return s;
}

export function listStages(): PipelineStage[] {
  return Array.from(registry.values());
}

export function clearRegistry(): void {
  registry.clear();
}
