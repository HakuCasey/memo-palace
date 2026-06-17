import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { EpisodicMemory, SemanticMemory } from '../types.js';

export const memoryRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  const db = app.db as import('better-sqlite3').Database;

  app.get('/api/memory/stats', async () => {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM episodic_memory) as episodic_total,
        (SELECT COUNT(*) FROM episodic_memory WHERE created_at >= date('now')) as episodic_today,
        (SELECT COUNT(*) FROM semantic_memory) as semantic_total,
        (SELECT COUNT(*) FROM semantic_memory WHERE created_at >= date('now')) as semantic_today
    `).get() as {
      episodic_total: number;
      episodic_today: number;
      semantic_total: number;
      semantic_today: number;
    };

    return {
      episodic: { total: stats.episodic_total, today: stats.episodic_today },
      semantic: { total: stats.semantic_total, today: stats.semantic_today },
    };
  });

  app.get('/api/memory/hot', async () => {
    // Fetch full objects separately so we can return complete memory data
    const episodicRows = db.prepare(`
      SELECT * FROM episodic_memory WHERE hit_count > 0 ORDER BY hit_count DESC LIMIT 5
    `).all() as any[];

    const semanticRows = db.prepare(`
      SELECT * FROM semantic_memory WHERE hit_count > 0 ORDER BY hit_count DESC LIMIT 5
    `).all() as any[];

    // Parse and combine
    const episodicItems = episodicRows.map((row) => {
      const consolidation = JSON.parse(row.consolidation_json);
      return {
        layer: 'episodic' as const,
        hit_count: row.hit_count,
        memory: {
          id: row.id,
          episodic_type: row.episodic_type,
          source: row.source,
          title: row.title,
          status: row.status,
          trigger: JSON.parse(row.trigger_json),
          resolution: row.resolution_json ? JSON.parse(row.resolution_json) : undefined,
          context: JSON.parse(row.context_json),
          tags: JSON.parse(row.tags_json),
          consolidation: { ...consolidation, group_key: row.group_key ?? undefined },
          hit_count: row.hit_count,
        } as EpisodicMemory,
      };
    });

    const semanticItems = semanticRows.map((row) => {
      return {
        layer: 'semantic' as const,
        hit_count: row.hit_count,
        memory: {
          id: row.id,
          semantic_type: row.semantic_type,
          title: row.title,
          knowledge: row.knowledge,
          source_type: row.source_type,
          source_episodic_ids: JSON.parse(row.source_episodic_ids_json),
          conditions: JSON.parse(row.conditions_json),
          category: row.category,
          confidence: row.confidence,
          tags: JSON.parse(row.tags_json),
          consolidation: JSON.parse(row.consolidation_json),
          hit_count: row.hit_count,
        } as SemanticMemory,
      };
    });

    // Merge and sort by hit_count DESC, take top 5
    const allItems = [...episodicItems, ...semanticItems]
      .sort((a, b) => b.hit_count - a.hit_count)
      .slice(0, 5);

    return { items: allItems };
  });

  done();
};
