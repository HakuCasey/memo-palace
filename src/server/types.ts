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
  hit_count: number;
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
  hit_count: number;
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
    params?: Record<string, any>;
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

export interface ServerStatus {
  uptime: number;
  memory_counts: {
    episodic: number;
    semantic: number;
    procedural: number;
  };
  pending_tasks: number;
}

export interface CreateEpisodicInput {
  source: EpisodicMemory['source'];
  episodic_type: EpisodicMemory['episodic_type'];
  title: string;
  trigger: EpisodicMemory['trigger'];
  resolution?: EpisodicMemory['resolution'];
  context?: Partial<EpisodicMemory['context']>;
  tags?: Partial<EpisodicMemory['tags']>;
}

export interface UpdateEpisodicInput {
  title?: string;
  status?: EpisodicMemory['status'];
  resolution?: EpisodicMemory['resolution'];
  context?: Partial<EpisodicMemory['context']>;
  tags?: Partial<EpisodicMemory['tags']>;
}

export interface CreateSemanticInput {
  title: string;
  semantic_type: SemanticMemory['semantic_type'];
  knowledge: string;
  source_type: SemanticMemory['source_type'];
  source_episodic_ids: string[];
  conditions: SemanticMemory['conditions'];
  category: string;
  confidence?: number;
  tags?: string[];
}

export interface UpdateSemanticInput {
  title?: string;
  knowledge?: string;
  conditions?: Partial<SemanticMemory['conditions']>;
  category?: string;
  confidence?: number;
  tags?: string[];
}

export interface CreateProceduralInput {
  name: string;
  description: string;
  trigger: ProceduralMemory['trigger'];
  actions: ProceduralMemory['actions'];
  source_semantic_ids?: string[];
  enabled?: boolean;
  priority?: number;
}

export interface UpdateProceduralInput {
  name?: string;
  description?: string;
  trigger?: Partial<ProceduralMemory['trigger']>;
  actions?: ProceduralMemory['actions'];
  enabled?: boolean;
  priority?: number;
  stats?: Partial<ProceduralMemory['stats']>;
}


// ============================================================================
// RFC-002 Pipeline & Schedule types
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
  last_run: PipelineRunRow | null;
}
