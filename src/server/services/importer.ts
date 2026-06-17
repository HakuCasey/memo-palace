import crypto from 'node:crypto';
import type { EpisodicMemory } from '../types.js';

interface DebugCase {
  dc_id: string;
  source: string;
  title: string;
  symptom: {
    error_signals: string[];
    error_code?: string;
    error_message: string;
    observed_environment?: string[];
    scenario: string;
  };
  root_cause: {
    category: string;
    analysis: string;
    related_api?: string;
    confidence?: number;
  };
  fix: {
    strategy: string;
    description: string;
    key_code_snippet?: string;
    validation?: string;
  };
  tags: {
    keywords: string[];
    severity: string;
    bug_type: string[];
  };
  evolver_meta?: {
    promoted_to_gene?: boolean;
    related_genes?: string[];
    ingested_at?: string;
  };
}

const SOURCE_MAP: Record<string, EpisodicMemory['source']> = {
  huawei_forum: 'crawler',
  github_issue: 'crawler',
  local_git: 'crawler',
  manual: 'manual',
};

function computeGroupKey(errorCode: string | undefined, category: string, fixStrategy: string): string {
  if (errorCode && errorCode.trim() !== '') {
    return errorCode;
  }
  return `${category}::${fixStrategy}`;
}

function convertToEpisodic(dc: DebugCase): EpisodicMemory {
  const hash = crypto
    .createHash('sha256')
    .update(`${dc.dc_id}:${dc.title}`)
    .digest('hex')
    .slice(0, 8);

  const source = SOURCE_MAP[dc.source] ?? 'crawler';
  const errorCode = dc.symptom.error_code;

  const groupKey = computeGroupKey(
    errorCode,
    dc.root_cause.category,
    dc.fix.strategy,
  );

  return {
    id: `ep_crawler_${hash}`,
    episodic_type: 'debug_case' as const,
    source,
    title: dc.title,
    status: 'resolved',
    trigger: {
      error_signals: dc.symptom.error_signals,
      error_code: errorCode,
      error_message: dc.symptom.error_message,
      scenario: dc.symptom.scenario,
    },
    resolution: {
      category: dc.root_cause.category,
      root_cause: dc.root_cause.analysis,
      fix_strategy: dc.fix.strategy,
      fix_description: dc.fix.description,
      key_code_snippet: dc.fix.key_code_snippet,
      validation: dc.fix.validation,
    },
    context: {
      observed_environment: dc.symptom.observed_environment,
      timestamp: dc.evolver_meta?.ingested_at ?? new Date().toISOString(),
    },
    tags: {
      keywords: dc.tags.keywords,
      severity: dc.tags.severity as EpisodicMemory['tags']['severity'],
      bug_type: dc.tags.bug_type,
    },
    consolidation: {
      group_key: groupKey,
      promoted_to_semantic: dc.evolver_meta?.promoted_to_gene ?? false,
      related_semantic_ids: dc.evolver_meta?.related_genes ?? [],
    },
    hit_count: 0,
  };
}

export class Importer {
  importCases(data: object[]): { count: number; records: EpisodicMemory[] } {
    const records: EpisodicMemory[] = [];
    for (const raw of data) {
      const dc = raw as DebugCase;
      const episodic = convertToEpisodic(dc);
      records.push(episodic);
    }
    return { count: records.length, records };
  }
}
