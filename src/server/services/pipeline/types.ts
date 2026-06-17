export interface StageHistoryEntry {
  stage_id: string;
  run_id: string;
  status: "success" | "partial" | "failed" | "skipped";
  at: string;
  note?: string;
}

export interface StageItem<P = unknown> {
  id: string;
  payload: P;
  _pipeline: {
    source_file: string;
    stage_history: StageHistoryEntry[];
  };
}

export interface StageError {
  item: StageItem;
  error: string;
}

export interface StageDropped {
  item: StageItem;
  reason: string;
}

export interface StageResult {
  out: StageItem[];
  dropped: StageDropped[];
  errors: StageError[];
}

export interface StageContext {
  run_id: string;
  trigger: "manual" | "schedule" | "retry";
  dryRun?: boolean;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

export interface PipelineStage {
  readonly id: string;
  inputs(): Promise<StageItem[]>;
  run(items: StageItem[], ctx: StageContext): Promise<StageResult>;
}
