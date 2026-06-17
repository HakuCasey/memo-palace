import type { StageHistoryEntry } from "./types.js";

export type SourceChannel = "huawei_forum" | "opencode_sessions" | "manual" | "dev_trouble_shot";

export interface CandidateBase {
  id: string;
  source_channel: SourceChannel;
  source_file: string;
  created_at: string;
  title: string;
  tags: string[];
  source_url?: string;
  _pipeline: {
    source_file: string;
    stage_history: StageHistoryEntry[];
  };
}

export interface HuaweiForumCandidate extends CandidateBase {
  source_channel: "huawei_forum";
  question: string;
  answer: string;
}

export interface OpencodeSessionCandidate extends CandidateBase {
  source_channel: "opencode_sessions";
  problem: string;
  solution: string;
  evidence?: string;
  signals: string[];
}

export interface ManualCandidate extends CandidateBase {
  source_channel: "manual";
  content: string;
}

export interface DevTroubleShotCandidate extends CandidateBase {
  source_channel: "dev_trouble_shot";
  problem: string;
  solution: string;
  evidence?: string;
  signals: string[];
}

export type Candidate = HuaweiForumCandidate | OpencodeSessionCandidate | ManualCandidate | DevTroubleShotCandidate;

export function isHuaweiForum(c: Candidate): c is HuaweiForumCandidate {
  return c.source_channel === "huawei_forum";
}
export function isOpencodeSession(c: Candidate): c is OpencodeSessionCandidate {
  return c.source_channel === "opencode_sessions";
}
export function isManual(c: Candidate): c is ManualCandidate {
  return c.source_channel === "manual";
}
export function isDevTroubleShot(c: Candidate): c is DevTroubleShotCandidate {
  return c.source_channel === "dev_trouble_shot";
}

export function mainText(c: Candidate): string {
  if (isHuaweiForum(c)) return [c.question, c.answer].filter(Boolean).join("\n");
  if (isOpencodeSession(c)) return [c.problem, c.solution].filter(Boolean).join("\n");
  if (isDevTroubleShot(c)) return [c.problem, c.solution].filter(Boolean).join("\n");
  return c.content;
}
