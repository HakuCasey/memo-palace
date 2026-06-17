import { MemoPalaceClient } from '../api-client.js';
import type { EpisodicMemory, SearchResult } from '../../server/types.js';

export interface BuildFailureInput {
  error_code?: string;
  error_signals: string[];
  error_message: string;
}

export interface FixSuccessInput {
  title: string;
  trigger: {
    error_signals: string[];
    error_code?: string;
    error_message: string;
    scenario: string;
  };
  resolution: {
    category: string;
    root_cause: string;
    fix_strategy: string;
    fix_description: string;
    key_code_snippet?: string;
    validation?: string;
  };
}

export interface FormattedSuggestion {
  id: string;
  title: string;
  status: string;
  trigger: EpisodicMemory['trigger'];
  resolution?: EpisodicMemory['resolution'];
  relevance: 'exact' | 'signal' | 'fts';
}

function formatSearchResults(results: SearchResult, errorCode?: string, errorSignals?: string[]): FormattedSuggestion[] {
  const suggestions: FormattedSuggestion[] = [];

  for (const ep of results.episodic) {
    let relevance: FormattedSuggestion['relevance'] = 'fts';
    if (errorCode && ep.trigger.error_code === errorCode) {
      relevance = 'exact';
    } else if (errorSignals && errorSignals.some((s) => ep.trigger.error_signals.includes(s))) {
      relevance = 'signal';
    }
    suggestions.push({
      id: ep.id,
      title: ep.title,
      status: ep.status,
      trigger: ep.trigger,
      resolution: ep.resolution,
      relevance,
    });
  }

  suggestions.sort((a, b) => {
    const order = { exact: 0, signal: 1, fts: 2 } as const;
    return order[a.relevance] - order[b.relevance];
  });

  return suggestions;
}

export async function handleBuildFailure(
  client: MemoPalaceClient,
  input: BuildFailureInput,
): Promise<{ suggestions: FormattedSuggestion[]; semantic_count: number; procedural_count: number }> {
  const queryParts: string[] = [];
  if (input.error_code) queryParts.push(input.error_code);
  if (input.error_message) queryParts.push(input.error_message);
  queryParts.push(...input.error_signals);

  const query = queryParts.join(' ') || 'unknown error';

  const results = await client.search(query, { episodic_type: 'debug_case' });

  const suggestions = formatSearchResults(results, input.error_code, input.error_signals);

  return {
    suggestions,
    semantic_count: results.semantic.length,
    procedural_count: results.procedural.length,
  };
}

export async function handleFixSuccess(
  client: MemoPalaceClient,
  input: FixSuccessInput,
): Promise<{ action: 'created' | 'updated'; id: string }> {
  const existingEpisodics = await client.listEpisodic({ status: 'open' });

  const match = existingEpisodics.find((ep) => {
    if (input.trigger.error_code && ep.trigger.error_code === input.trigger.error_code) {
      return true;
    }
    return input.trigger.error_signals.some((s) => ep.trigger.error_signals.includes(s));
  });

  if (match) {
    const updated = await client.updateEpisodic(match.id, {
      status: 'resolved',
      resolution: input.resolution,
    });
    return { action: 'updated', id: updated.id };
  }

  const created = await client.createEpisodic({
    source: 'opencode_hook',
    episodic_type: 'debug_case',
    title: input.title,
    trigger: input.trigger,
    resolution: input.resolution,
    tags: {
      keywords: [...input.trigger.error_signals, input.resolution.category],
      severity: 'major',
      bug_type: [input.resolution.category],
    },
  });

  const resolved = await client.updateEpisodic(created.id, {
    status: 'resolved',
  });

  return { action: 'created', id: resolved.id };
}

export async function handleSessionStart(
  client: MemoPalaceClient,
): Promise<{ connectivity: string; db_health: string; memory_stats: { episodic: number; semantic: number; procedural: number } }> {
  const result = await client.selfCheck();
  return result;
}
