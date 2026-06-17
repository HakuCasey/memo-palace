import type Database from 'better-sqlite3';
import type {
  EpisodicMemory,
  SemanticMemory,
  SearchResult,
} from '../types.js';

interface EpisodicDbRow {
  id: string;
  episodic_type: string;
  source: string;
  title: string;
  status: string;
  trigger_json: string;
  resolution_json: string | null;
  context_json: string;
  tags_json: string;
  consolidation_json: string;
  group_key: string | null;
  created_at: string;
  updated_at: string;
}

interface SemanticDbRow {
  id: string;
  semantic_type: string;
  title: string;
  knowledge: string;
  source_type: string;
  source_episodic_ids_json: string;
  conditions_json: string;
  category: string;
  confidence: number;
  tags_json: string;
  consolidation_json: string;
  created_at: string;
  updated_at: string;
}

function parseEpisodicRow(row: EpisodicDbRow): EpisodicMemory {
  const consolidation = JSON.parse(row.consolidation_json);
  return {
    id: row.id,
    episodic_type: row.episodic_type as EpisodicMemory['episodic_type'],
    source: row.source as EpisodicMemory['source'],
    title: row.title,
    status: row.status as EpisodicMemory['status'],
    trigger: JSON.parse(row.trigger_json),
    resolution: row.resolution_json ? JSON.parse(row.resolution_json) : undefined,
    context: JSON.parse(row.context_json),
    tags: JSON.parse(row.tags_json),
    consolidation: {
      ...consolidation,
      group_key: row.group_key ?? undefined,
    },
    hit_count: (row as any).hit_count ?? 0,
  };
}

function parseSemanticRow(row: SemanticDbRow): SemanticMemory {
  return {
    id: row.id,
    semantic_type: row.semantic_type as SemanticMemory['semantic_type'],
    title: row.title,
    knowledge: row.knowledge,
    source_type: row.source_type as SemanticMemory['source_type'],
    source_episodic_ids: JSON.parse(row.source_episodic_ids_json),
    conditions: JSON.parse(row.conditions_json),
    category: row.category,
    confidence: row.confidence,
    tags: JSON.parse(row.tags_json),
    consolidation: JSON.parse(row.consolidation_json),
    hit_count: (row as any).hit_count ?? 0,
  };
}

export class Retriever {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  search(query: string, layer?: 'episodic' | 'semantic', limit: number = 20, episodic_type?: string, semantic_type?: string): SearchResult {
    if (layer === 'semantic') {
      return { procedural: [], semantic: this.searchSemantic(query, limit, semantic_type), episodic: [] };
    }
    if (layer === 'episodic') {
      return { procedural: [], semantic: [], episodic: this.searchEpisodic(query, limit, episodic_type) };
    }

    return {
      procedural: [],
      semantic: this.searchSemantic(query, limit, semantic_type),
      episodic: this.searchEpisodic(query, limit, episodic_type),
    };
  }

  searchSemantic(query: string, limit: number = 20, semantic_type?: string): SemanticMemory[] {
    const tokens = query.split(/\s+/).filter(t => t.length > 0);
    const ftsQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    const conditions: string[] = [];
    const params: unknown[] = [ftsQuery];

    if (semantic_type) {
      conditions.push('AND em.semantic_type = ?');
      params.push(semantic_type);
    }

    params.push(limit);

    let rows = this.db
      .prepare(
        `SELECT sm.* FROM semantic_memory sm
         JOIN semantic_fts fts ON sm.rowid = fts.rowid
         WHERE semantic_fts MATCH ? ${conditions.join(' ')}
         ORDER BY sm.confidence DESC
         LIMIT ?`,
      )
      .all(...params) as SemanticDbRow[];

    if (rows.length === 0) {
      const likeConditions: string[] = [];
      const likeParams: unknown[] = [];
      for (const col of ['title', 'knowledge', 'category'] as const) {
        for (const token of tokens) {
          likeConditions.push(`sm.${col} LIKE ?`);
          likeParams.push(`%${token}%`);
        }
      }
      const typeConditions: string[] = [...likeConditions];
      const typeParams: unknown[] = [...likeParams];
      if (semantic_type) {
        typeConditions.push('sm.semantic_type = ?');
        typeParams.push(semantic_type);
      }
      rows = this.db
        .prepare(
          `SELECT sm.* FROM semantic_memory sm
           WHERE (${typeConditions.join(' OR ')})
           ORDER BY sm.confidence DESC
           LIMIT ?`,
        )
        .all(...typeParams, limit) as SemanticDbRow[];
    }

    return rows.map(parseSemanticRow);
  }

  searchEpisodic(query: string, limit: number = 20, episodic_type?: string): EpisodicMemory[] {
    const tokens = query.split(/\s+/).filter(t => t.length > 0);
    const ftsQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    const conditions: string[] = [];
    const params: unknown[] = [ftsQuery];

    if (episodic_type) {
      conditions.push('AND em.episodic_type = ?');
      params.push(episodic_type);
    }

    params.push(limit);

    let rows = this.db
      .prepare(
        `SELECT em.* FROM episodic_memory em
         JOIN episodic_fts fts ON em.rowid = fts.rowid
         WHERE episodic_fts MATCH ? ${conditions.join(' ')}
         ORDER BY em.created_at DESC
         LIMIT ?`,
      )
      .all(...params) as EpisodicDbRow[];

    if (rows.length === 0) {
      const likeConditions: string[] = [];
      const likeParams: unknown[] = [];
      for (const col of ['title', 'trigger_json', 'tags_json'] as const) {
        for (const token of tokens) {
          likeConditions.push(`em.${col} LIKE ?`);
          likeParams.push(`%${token}%`);
        }
      }
      const typeConditions: string[] = [...likeConditions];
      const typeParams: unknown[] = [...likeParams];
      if (episodic_type) {
        typeConditions.push('em.episodic_type = ?');
        typeParams.push(episodic_type);
      }
      rows = this.db
        .prepare(
          `SELECT em.* FROM episodic_memory em
           WHERE (${typeConditions.join(' OR ')})
           ORDER BY em.created_at DESC
           LIMIT ?`,
        )
        .all(...typeParams, limit) as EpisodicDbRow[];
    }

    return rows.map(parseEpisodicRow);
  }

  searchByHookSignals(errorCode: string, errorSignals: string[], limit: number = 20): EpisodicMemory[] {
    const exactMatches = this.db
      .prepare(
        `SELECT em.* FROM episodic_memory em
         WHERE json_extract(em.trigger_json, '$.error_code') = ?
         ORDER BY em.created_at DESC`,
      )
      .all(errorCode) as EpisodicDbRow[];

    if (exactMatches.length >= limit) {
      return exactMatches.slice(0, limit).map(parseEpisodicRow);
    }

    const signalMatches = this.searchByErrorSignals(errorSignals, limit - exactMatches.length);
    const seenIds = new Set(exactMatches.map((r) => r.id));
    const uniqueSignalMatches = signalMatches.filter((r) => !seenIds.has(r.id)).map(parseEpisodicRow);

    const combined = [...exactMatches.map(parseEpisodicRow), ...uniqueSignalMatches];
    if (combined.length >= limit) return combined.slice(0, limit);

    const ftsResults = this.searchEpisodic(errorCode, limit - combined.length);
    const seenIds2 = new Set(combined.map((r) => r.id));
    const uniqueFts = ftsResults.filter((r) => !seenIds2.has(r.id));

    return [...combined, ...uniqueFts].slice(0, limit);
  }

  private searchByErrorSignals(errorSignals: string[], limit: number): EpisodicDbRow[] {
    if (errorSignals.length === 0) return [];

    const conditions = errorSignals.map(() => `json_extract(em.trigger_json, '$.error_signals') LIKE ?`);
    const where = conditions.join(' OR ');
    const params = errorSignals.map((s) => `%"${s}"%`);

    return this.db
      .prepare(
        `SELECT em.* FROM episodic_memory em
         WHERE ${where}
         ORDER BY em.created_at DESC
         LIMIT ?`,
      )
      .all(...params, limit) as EpisodicDbRow[];
  }
}
