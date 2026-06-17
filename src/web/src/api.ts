export interface EpisodicMemory {
  id: string;
  episodic_type: 'debug_case' | 'api_trap' | 'config_trap' | 'dev_note';
  source: 'opencode_hook' | 'manual' | 'crawler';
  title: string;
  status: 'open' | 'resolved' | 'archived';
  trigger: {
    error_signals: string[];
    error_code?: string;
    error_message: string;
    scenario: string;
  };
  resolution?: {
    category: string;
    root_cause: string;
    fix_strategy: string;
    fix_description: string;
    key_code_snippet?: string;
    validation?: string;
  };
  context: {
    observed_environment?: string[];
    project?: string;
    agent_session_id?: string;
    timestamp: string;
  };
  tags: {
    keywords: string[];
    severity: 'critical' | 'major' | 'minor' | 'cosmetic';
    bug_type: string[];
  };
  consolidation: {
    group_key?: string;
    promoted_to_semantic: boolean;
    related_semantic_ids: string[];
  };
}

export interface SemanticMemory {
  id: string;
  semantic_type: 'pattern' | 'best_practice' | 'dev_specification';
  title: string;
  knowledge: string;
  source_type: 'consolidated' | 'manual' | 'imported';
  source_episodic_ids: string[];
  conditions: {
    applicable_context: string[];
    related_apis?: string[];
    error_codes?: string[];
  };
  category: string;
  confidence: number;
  tags: string[];
  consolidation: {
    created_at: string;
    last_matched_at?: string;
    match_count: number;
  };
}

export interface ProceduralMemory {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'error_signal' | 'keyword' | 'event' | 'manual';
    pattern: string;
    conditions?: string[];
  };
  actions: {
    type: 'search' | 'suggest' | 'notify' | 'auto_fix';
    target: string;
    params?: Record<string, unknown>;
  }[];
  source_semantic_ids: string[];
  enabled: boolean;
  priority: number;
  stats: {
    triggered_count: number;
    success_count: number;
    last_triggered_at?: string;
  };
}

export interface EvolutionTask {
  id: string;
  type: string;
  status: 'pending' | 'confirmed' | 'executed' | 'rejected';
  source_ids: string[];
  result_id?: string;
  detail: string;
  created_at: string;
  resolved_at?: string;
}

export interface SearchResult {
  procedural: ProceduralMemory[];
  semantic: SemanticMemory[];
  episodic: EpisodicMemory[];
}

export interface MemoryStatsResponse {
  episodic: { total: number; today: number };
  semantic: { total: number; today: number };
}

export interface MemoryRecentItem {
  layer: string;
  id: string;
  title: string;
  created_at: string;
}

export interface MemoryRecentResponse {
  items: MemoryRecentItem[];
}

export interface MemoryHotItem {
  layer: string;
  hit_count: number;
  memory: EpisodicMemory | SemanticMemory;
}

export interface MemoryHotResponse {
  items: MemoryHotItem[];
}

export interface ServerStatus {
  uptime: number;
  memory_counts: {
    episodic: number;
    semantic: number;
    procedural: number;
  };
  pending_tasks: number;
}

export interface SelfCheckResult {
  connectivity: string;
  memory_stats: { episodic: number; semantic: number; procedural: number };
  db_health: string;
}

export interface ClientInfo {
  client_id: string;
  display_name: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ClientGroup {
  type: string;
  clients: ClientInfo[];
}

export interface AccessStats {
  today_search_count: number;
  hot_queries: { query: string; count: number }[];
}

export interface AccessLogItem {
  accessed_at: string;
  client_type: string;
  display_name: string;
  action_type: string;
  query: string | null;
  result_count: number;
  result_ids: string[];
}

export interface HookEvent {
  id: number;
  client_id: string;
  action_type: string;
  query: string | null;
  error_summary?: string;
  result_count: number;
  result_ids?: string[];
  injected?: boolean;
  session_id?: string;
  tool_name?: string;
  injected_context?: string;
  accessed_at: string;
}

// ============================================================================
// RFC-002 Pipeline & Schedule types (mirror of src/server/types.ts)
// ============================================================================

export interface PipelineRunRow {
  run_id: string;
  stage_id: string;
  trigger: 'manual' | 'schedule' | 'retry';
  status: 'running' | 'success' | 'partial' | 'failed' | 'skipped';
  in_count: number;
  out_count: number;
  dropped_count: number;
  error_count: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  errors_json: string | null;
  input_ids_json: string | null;
  notes: string | null;
}

export interface PipelineScheduleRow {
  schedule_id: string;
  stage_id: string;
  cron: string;
  enabled: number;
  last_run_id: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStageSummary {
  stage_id: string;
  runs: PipelineRunRow[];
}

export interface SourceFileDTO {
  id: string;
  name: string;
  count: number;
  evolvedCount?: number;
  size: number;
  modified: string;
  evolved?: boolean;
}
export interface SourceChannelDTO {
  channel: string;
  files: SourceFileDTO[];
}

export interface FilterRuleDTO {
  id: string;
  name: string;
  field: string;
  operator: "min_length" | "not_empty" | "contains_any" | "contains_all" | "regex";
  value_json: string | null;
  enabled: number;
  priority: number;
  mode: "include" | "exclude";
  created_at: string;
  updated_at: string;
}

export interface CandidateDTO {
  id: string;
  payload: {
    source_channel?: "huawei_forum" | "opencode_sessions" | "manual" | "dev_trouble_shot";
    source_file?: string;
    title?: string;
    tags?: string[];
    source_url?: string;
    question?: string;
    answer?: string;
    problem?: string;
    solution?: string;
    evidence?: string;
    signals?: string[];
    content?: string;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body != null;
  const res = await fetch(path, {
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  search: (query: string, options?: { layer?: string; limit?: number; episodic_type?: string; semantic_type?: string }) =>
    request<SearchResult>('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }),

  getMemoryStats: () => request<MemoryStatsResponse>('/api/memory/stats'),

  getMemoryRecent: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<MemoryRecentResponse>(`/api/memory/recent${qs}`);
  },

  getMemoryHot: () => request<MemoryHotResponse>('/api/memory/hot'),

  createEpisodic: (data: Record<string, unknown>) =>
    request<EpisodicMemory>('/api/episodic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkDupEpisodic: (title: string) =>
    request<{ duplicate: boolean; existing_id?: string }>('/api/episodic/check-dup', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  listEpisodic: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<EpisodicMemory[]>(`/api/episodic${qs}`);
  },

  listEpisodicTitles: () =>
    request<{ items: Array<{ id: string; title: string }> }>('/api/episodic/list-titles'),

  deleteEpisodic: (id: string) =>
    request<{ deleted: boolean }>(`/api/episodic/${id}`, { method: 'DELETE' }),

  batchDeleteEpisodic: (ids: string[]) =>
    request<{ deleted_count: number }>('/api/episodic/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  getStatus: () => request<ServerStatus>('/api/status'),

  getSelfCheck: () => request<SelfCheckResult>('/api/self-check'),

  getClients: () => request<ClientGroup[]>('/api/clients'),

  clearClients: () => request<{ deleted: number }>('/api/clients', { method: 'DELETE' }),

  runSelfCheck: () => request<{ checks: Record<string, string>; checked_at: string }>('/api/self-check/run', { method: 'POST', body: '{}' }),

  getAccessStats: () => request<AccessStats>('/api/access/stats'),

  getAccessRecent: () => request<{ items: AccessLogItem[] }>('/api/access/recent'),

  importData: (data: object[]) =>
    request<{ imported: number }>('/api/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  analyze: () =>
    request<{ new_tasks: number }>('/api/evolution/analyze', { method: 'POST' }),

  listEvolutionTasks: () => request<EvolutionTask[]>('/api/evolution/tasks'),

  confirmTask: (id: string) =>
    request<EvolutionTask>(`/api/evolution/tasks/${id}/confirm`, { method: 'POST' }),

  rejectTask: (id: string) =>
    request<EvolutionTask>(`/api/evolution/tasks/${id}/reject`, { method: 'POST' }),

  listEvolutionHistory: () => request<EvolutionTask[]>('/api/evolution/history'),

  listSemantic: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<SemanticMemory[]>(`/api/semantic${qs}`);
  },

  listProcedural: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<ProceduralMemory[]>(`/api/procedural${qs}`);
  },

  createSemantic: (data: Record<string, unknown>) =>
    request<SemanticMemory>('/api/semantic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createProcedural: (data: Record<string, unknown>) =>
    request<ProceduralMemory>('/api/procedural', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ==========================================================================
  // RFC-002 Pipeline & Schedule client methods
  // ==========================================================================

  listPipelineStages: () => request<PipelineStageSummary[]>('/api/pipeline/stages'),

  listStageItems: (stageId: string) =>
    request<{ items: unknown[]; total: number }>(`/api/pipeline/stages/${stageId}/items`),

  runStage: (stageId: string, body: { ids?: string[]; dryRun?: boolean }) =>
    request<PipelineRunRow>(`/api/pipeline/stages/${stageId}/run`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  retryRun: (runId: string) =>
    request<PipelineRunRow>(`/api/pipeline/runs/${runId}/retry`, { method: 'POST', body: '{}' }),

  ignoreStageItems: (stageId: string, ids: string[]) =>
    request<{ ignored: number }>(`/api/pipeline/stages/${stageId}/ignore`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  clearRunErrors: (runId: string) =>
    request<{ cleared: boolean }>(`/api/pipeline/runs/${runId}/errors`, { method: 'DELETE' }),

  runAllStages: () =>
    request<{ run_ids: Record<string, string> }>('/api/pipeline/run-all', { method: 'POST', body: '{}' }),

  listRuns: (q?: { stage_id?: string; status?: string; limit?: number; offset?: number }) => {
    const qs = q
      ? '?' + new URLSearchParams(
          Object.entries(q)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)]),
        ).toString()
      : '';
    return request<{ rows: PipelineRunRow[] }>(`/api/pipeline/runs${qs}`);
  },

  getRun: (runId: string) => request<PipelineRunRow>(`/api/pipeline/runs/${runId}`),

  getRunStats: () => request<{ total: number; threshold: number; over_threshold: boolean }>('/api/pipeline/runs/stats'),

  clearRuns: (body: { before?: string; stage_id?: string; status?: string }) =>
    request<{ deleted: number }>('/api/pipeline/runs', {
      method: 'DELETE',
      body: JSON.stringify({ ...body, confirm: true }),
    }),

  clearAll: () =>
    request<{ cleared: boolean; runs_deleted: number }>('/api/pipeline/clear-all', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),

  revertSources: (ids: string[]) =>
    request<{ reverted: string[] }>('/api/pipeline/revert', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  listSchedules: () => request<PipelineScheduleRow[]>('/api/schedule'),

  upsertSchedule: (body: { stage_id: string; cron: string; enabled: boolean }) =>
    request<PipelineScheduleRow>('/api/schedule', { method: 'POST', body: JSON.stringify(body) }),

  removeSchedule: (scheduleId: string) =>
    request<{ removed: boolean }>(`/api/schedule/${scheduleId}`, { method: 'DELETE' }),

  listSources: () => request<SourceChannelDTO[]>('/api/sources'),

  listRules: () => request<FilterRuleDTO[]>('/api/analyzer/rules'),

  createRule: (input: Partial<FilterRuleDTO> & { value?: unknown }) =>
    request<FilterRuleDTO>('/api/analyzer/rules', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateRule: (id: string, patch: Partial<FilterRuleDTO> & { value?: unknown }) =>
    request<FilterRuleDTO>(`/api/analyzer/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteRule: (id: string) =>
    request<{ deleted: number }>(`/api/analyzer/rules/${id}`, { method: 'DELETE' }),

  reorderRules: (ids: string[]) =>
    request<{ ok: boolean }>('/api/analyzer/rules/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  batchRun: (sourceFileIds: string[]) =>
    request<{ run_ids: Record<string, string> }>('/api/pipeline/batch-run', {
      method: 'POST',
      body: JSON.stringify({ ids: sourceFileIds }),
    }),

  getHookEvents: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<{ items: HookEvent[] }>(`/api/hook/events${qs}`);
  },

  listArtifacts: (bucket: 'normalizer' | 'filter' | 'evolved', limit = 200) =>
    request<{ items: CandidateDTO[]; total: number }>(`/api/pipeline/artifacts/${bucket}?limit=${limit}`),

  removeArtifacts: (bucket: 'normalizer' | 'filter' | 'evolved', ids: string[]) =>
    request<{ removed: number }>(`/api/pipeline/artifacts/${bucket}?ids=${ids.join(",")}`, {
      method: 'DELETE',
    }),

  listArtifactErrors: (bucket: 'normalizer' | 'filter') =>
    request<{ items: Array<{ id: string; payload: { title?: string }; _reason?: string; _error?: string }>; total: number }>(`/api/pipeline/artifacts/${bucket}/errors`),
};
