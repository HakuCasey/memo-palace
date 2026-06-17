import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { Importer } from '../services/importer.js';
import { localNow } from '../db/connection.js';

interface DbRow {
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

export const systemRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.get('/api/status', async () => {
    const db = app.db as import('better-sqlite3').Database;

    const episodic = (db.prepare('SELECT COUNT(*) as count FROM episodic_memory').get() as any).count;
    const semantic = (db.prepare('SELECT COUNT(*) as count FROM semantic_memory').get() as any).count;
    const procedural = 0;
    const pendingTasks = (db.prepare("SELECT COUNT(*) as count FROM evolution_tasks WHERE status = 'pending'").get() as any).count;

    return {
      uptime: process.uptime(),
      memory_counts: { episodic, semantic, procedural },
      pending_tasks: pendingTasks,
    };
  });

  app.get('/api/self-check', async () => {
    const db = app.db as import('better-sqlite3').Database;

    let dbHealth = 'OK';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbHealth = 'ERROR';
    }

    const episodic = (db.prepare('SELECT COUNT(*) as count FROM episodic_memory').get() as any).count;
    const semantic = (db.prepare('SELECT COUNT(*) as count FROM semantic_memory').get() as any).count;
    const procedural = 0;

    return {
      connectivity: 'OK',
      memory_stats: { episodic, semantic, procedural },
      db_health: dbHealth,
    };
  });

  app.get('/api/clients', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const rows = db.prepare('SELECT * FROM client_registry ORDER BY client_type, last_seen_at DESC').all() as any[];
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      if (!grouped.has(row.client_type)) grouped.set(row.client_type, []);
      grouped.get(row.client_type)!.push({
        client_id: row.client_id,
        display_name: row.display_name,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at,
      });
    }
    return Array.from(grouped.entries()).map(([type, clients]) => ({ type, clients }));
  });

  app.delete('/api/clients', async () => {
    const db = app.db as import('better-sqlite3').Database;
    db.prepare('DELETE FROM client_access_log').run();
    const result = db.prepare('DELETE FROM client_registry').run();
    return { deleted: result.changes };
  });

  app.post('/api/self-check/run', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const checks: Record<string, string> = {};
    try {
      db.prepare('SELECT 1').get();
      checks.db_connection = 'OK';
    } catch {
      checks.db_connection = 'ERROR';
    }
    try {
      const tables = ['episodic_memory', 'semantic_memory', 'client_registry', 'client_access_log'];
      for (const t of tables) {
        db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get();
      }
      checks.tables = 'OK';
    } catch {
      checks.tables = 'ERROR';
    }
    return { checks, checked_at: new Date().toISOString() };
  });

  app.get('/api/access/stats', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const todayStr = localNow().slice(0, 10);
    const todaySearch = (db.prepare("SELECT COUNT(*) as count FROM client_access_log WHERE action_type = 'search' AND accessed_at >= ?").get(todayStr) as any).count;
    const hotQueries = db.prepare(`
      SELECT query, COUNT(*) as count FROM client_access_log
      WHERE action_type = 'search' AND query IS NOT NULL
      GROUP BY query ORDER BY count DESC LIMIT 10
    `).all() as any[];
    return {
      today_search_count: todaySearch,
      hot_queries: hotQueries.map(q => ({ query: q.query, count: q.count })),
    };
  });

  app.get('/api/access/recent', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const rows = db.prepare(`
      SELECT l.*, r.display_name, r.client_type
      FROM client_access_log l
      JOIN client_registry r ON l.client_id = r.client_id
      ORDER BY l.accessed_at DESC LIMIT 20
    `).all() as any[];
    return {
      items: rows.map(r => ({
        accessed_at: r.accessed_at,
        client_type: r.client_type,
        display_name: r.display_name,
        action_type: r.action_type,
        query: r.query,
        result_count: r.result_count,
        result_ids: r.result_ids_json ? JSON.parse(r.result_ids_json) : [],
      })),
    };
  });

  app.post<{ Body: { action_type: string; query?: string; error_summary?: string; result_count?: number; result_ids?: string[]; injected?: boolean; session_id?: string; tool_name?: string; injected_context?: string } }>(
    '/api/hook/event',
    async (req) => {
      const db = app.db as import('better-sqlite3').Database;
      const raw = req.body;
      const ansiRe = /\x1b\[[0-9;]*[a-zA-Z]|\[[\d;]*m/g;
      const strip = (s?: string) => s ? s.replace(ansiRe, '') : s;
      const { action_type, result_count, injected, session_id, tool_name, result_ids, injected_context } = raw;
      const query = strip(raw.query);
      const error_summary = strip(raw.error_summary);
      const clientId = req.headers['x-client-id'] as string | undefined;
      const metadataJson = JSON.stringify({ error_summary, result_count, injected, session_id, tool_name, result_ids, injected_context });

      db.prepare(`
        INSERT INTO client_access_log (client_id, action_type, query, result_ids_json, result_count, accessed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(clientId || 'hook_unknown', action_type, query ?? null, metadataJson, result_count ?? 0, localNow());

      return { ok: true };
    },
  );

  app.get('/api/hook/events', async (req) => {
    const db = app.db as import('better-sqlite3').Database;
    const limit = Math.min(parseInt((req.query as any).limit as string) || 50, 200);
    const rows = db.prepare(`
      SELECT log_id, client_id, action_type, query, result_ids_json, result_count, accessed_at
      FROM client_access_log
      WHERE action_type IN ('hook_error', 'hook_review')
      ORDER BY accessed_at DESC LIMIT ?
    `).all(limit) as any[];

    return {
      items: rows.map(r => {
        let metadata: any = {};
        try { metadata = JSON.parse(r.result_ids_json); } catch {}
        return {
          id: r.log_id,
          client_id: r.client_id,
          action_type: r.action_type,
          query: r.query,
          error_summary: metadata.error_summary,
          result_count: r.result_count,
          injected: metadata.injected,
          session_id: metadata.session_id,
          tool_name: metadata.tool_name,
          result_ids: metadata.result_ids || [],
          injected_context: metadata.injected_context,
          accessed_at: r.accessed_at,
        };
      }),
    };
  });

  app.post<{ Body: object[] }>('/api/import', async (req) => {
    const db = app.db as import('better-sqlite3').Database;
    const data = req.body;
    const importer = new Importer();
    const { count, records } = importer.importCases(data);

    const stmt = db.prepare(`
      INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, resolution_json, context_json, tags_json, consolidation_json, group_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = localNow();
    const insertMany = db.transaction((items: typeof records) => {
      for (const r of items) {
        stmt.run(
          r.id,
          r.episodic_type,
          r.source,
          r.title,
          r.status,
          JSON.stringify(r.trigger),
          r.resolution ? JSON.stringify(r.resolution) : null,
          JSON.stringify(r.context),
          JSON.stringify(r.tags),
          JSON.stringify(r.consolidation),
          r.consolidation.group_key ?? null,
          now,
          now,
        );
      }
    });

    insertMany(records);

    return { imported: count };
  });

  done();
};
