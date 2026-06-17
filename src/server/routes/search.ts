import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { Retriever } from '../services/retriever.js';
import { localNow } from '../db/connection.js';

interface SearchBody {
  query: string;
  layer?: 'episodic' | 'semantic';
  limit?: number;
  episodic_type?: string;
  semantic_type?: string;
}

export const searchRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.post<{ Body: SearchBody }>(
    '/api/search',
    async (req) => {
      const { query, layer, limit = 20, episodic_type, semantic_type } = req.body;
      const db = app.db as import('better-sqlite3').Database;
      const retriever = new Retriever(db);
      const result = retriever.search(query, layer, limit, episodic_type, semantic_type);

      // RFC-005: increment hit_count for returned results
      const updateHitCount = (table: string, items: Array<{ id: string }>) => {
        if (items.length === 0) return;
        const placeholders = items.map(() => '?').join(',');
        db.prepare(`UPDATE ${table} SET hit_count = hit_count + 1 WHERE id IN (${placeholders})`)
          .run(...items.map(i => i.id));
      };

      updateHitCount('episodic_memory', result.episodic);
      updateHitCount('semantic_memory', result.semantic);

      // RFC-006: record search access log
      const clientId = req.headers['x-client-id'] as string | undefined;
      if (clientId) {
        const resultIds = [
          ...result.episodic.map(m => m.id),
          ...result.semantic.map(m => m.id),
        ];
        const totalCount = resultIds.length;

        // Check if same client + query within 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const existing = db.prepare(`
          SELECT log_id FROM client_access_log
          WHERE client_id = ? AND action_type = 'search' AND query = ? AND accessed_at >= ?
          ORDER BY accessed_at DESC LIMIT 1
        `).get(clientId, query, fiveMinAgo) as { log_id: number } | undefined;

        if (existing) {
          db.prepare('UPDATE client_access_log SET accessed_at = ?, result_ids_json = ?, result_count = ? WHERE log_id = ?')
            .run(localNow(), JSON.stringify(resultIds), totalCount, existing.log_id);
        } else {
          db.prepare(`
            INSERT INTO client_access_log (client_id, action_type, query, result_ids_json, result_count)
            VALUES (?, 'search', ?, ?, ?)
          `).run(clientId, query, JSON.stringify(resultIds), totalCount);
        }
      }

      return result;
    },
  );

  done();
};
