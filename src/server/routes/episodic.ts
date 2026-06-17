import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type {
  CreateEpisodicInput,
  EpisodicMemory,
  UpdateEpisodicInput,
} from '../types.js';
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

function generateId(source: string, title: string): string {
  const content = `${title}:${Date.now()}:${Math.random()}`;
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `ep_${source}_${hash}`;
}

function parseRow(row: DbRow): EpisodicMemory {
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

export const episodicRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.post<{ Body: CreateEpisodicInput }>(
    '/api/episodic',
    async (req, reply) => {
      const input = req.body;
      const db = app.db as import('better-sqlite3').Database;

      const id = generateId(input.source, input.title);
      const now = localNow();

      const context = {
        timestamp: now,
        ...(input.context ?? {}),
      };

      const tags = input.tags ?? {
        keywords: [],
        severity: 'minor' as const,
        bug_type: [],
      };

      const consolidation = {
        promoted_to_semantic: false,
        related_semantic_ids: [],
      };

      const stmt = db.prepare(`
        INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, resolution_json, context_json, tags_json, consolidation_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        input.episodic_type,
        input.source,
        input.title,
        JSON.stringify(input.trigger),
        input.resolution ? JSON.stringify(input.resolution) : null,
        JSON.stringify(context),
        JSON.stringify(tags),
        JSON.stringify(consolidation),
        now,
        now,
      );

      const row = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get(id) as DbRow;
      reply.code(201);
      return parseRow(row);
    },
  );

  app.post<{ Body: { title: string } }>(
    '/api/episodic/check-dup',
    async (req) => {
      const db = app.db as import('better-sqlite3').Database;
      const { title } = req.body;

      if (!title || typeof title !== 'string') {
        return { duplicate: false };
      }

      const prefix = title.slice(0, 20).replace(/[%_]/g, c => '\\' + c);
      const candidates = db.prepare(
        `SELECT id, title FROM episodic_memory WHERE title LIKE ? || '%' ESCAPE '\\' LIMIT 50`,
      ).all(prefix) as { id: string; title: string }[];

      const match = candidates.find(r => r.title === title);
      if (match) {
        return { duplicate: true, existing_id: match.id };
      }

      return { duplicate: false };
    },
  );

  app.get('/api/episodic/list-titles', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const rows = db.prepare(`
      SELECT id, title FROM episodic_memory ORDER BY title COLLATE NOCASE ASC
    `).all() as { id: string; title: string }[];
    return { items: rows };
  });

  app.delete<{ Params: { id: string } }>('/api/episodic/:id', async (req, reply) => {
    const db = app.db as import('better-sqlite3').Database;
    const result = db.prepare('DELETE FROM episodic_memory WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return { deleted: true };
  });

  app.post<{ Body: { ids: string[] } }>('/api/episodic/batch-delete', async (req) => {
    const db = app.db as import('better-sqlite3').Database;
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { deleted_count: 0 };
    }
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM episodic_memory WHERE id IN (${placeholders})`).run(...ids);
    return { deleted_count: result.changes };
  });

  app.get<{ Querystring: { status?: string; source?: string; episodic_type?: string; page?: string; limit?: string } }>(
    '/api/episodic',
    async (req) => {
      const db = app.db as import('better-sqlite3').Database;
      const { status, source, episodic_type, page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 20);
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }
      if (source) {
        conditions.push('source = ?');
        params.push(source);
      }
      if (episodic_type) {
        conditions.push('episodic_type = ?');
        params.push(episodic_type);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM episodic_memory ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limitNum, offset) as DbRow[];

      return rows.map(parseRow);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/episodic/:id',
    async (req, reply) => {
      const db = app.db as import('better-sqlite3').Database;
      const row = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get(req.params.id) as DbRow | undefined;

      if (!row) {
        reply.code(404);
        return { error: 'Not found' };
      }

      return parseRow(row);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateEpisodicInput }>(
    '/api/episodic/:id',
    async (req, reply) => {
      const db = app.db as import('better-sqlite3').Database;
      const { id } = req.params;
      const input = req.body;

      const existing = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get(id) as DbRow | undefined;
      if (!existing) {
        reply.code(404);
        return { error: 'Not found' };
      }

      const existingParsed = parseRow(existing);
      const newTitle = input.title ?? existingParsed.title;
      const newStatus = input.status ?? existingParsed.status;
      const newResolution = input.resolution ?? existingParsed.resolution;
      const newContext = input.context
        ? { ...existingParsed.context, ...input.context }
        : existingParsed.context;
      const newTags = input.tags
        ? { ...existingParsed.tags, ...input.tags }
        : existingParsed.tags;

      let groupKey = existing.group_key;
      const consolidation = JSON.parse(existing.consolidation_json);

      if (newStatus === 'resolved') {
        const trigger = existingParsed.trigger;
        if (trigger.error_code && trigger.error_code.trim() !== '') {
          groupKey = trigger.error_code;
        } else if (newResolution) {
          groupKey = `${newResolution.category}::${newResolution.fix_strategy}`;
        }
        consolidation.group_key = groupKey;
      }

      const stmt = db.prepare(`
        UPDATE episodic_memory
        SET title = ?, status = ?, resolution_json = ?, context_json = ?, tags_json = ?, consolidation_json = ?, group_key = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        newTitle,
        newStatus,
        newResolution ? JSON.stringify(newResolution) : null,
        JSON.stringify(newContext),
        JSON.stringify(newTags),
        JSON.stringify(consolidation),
        groupKey,
        localNow(),
        id,
      );

      const row = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get(id) as DbRow;
      return parseRow(row);
    },
  );

  done();
};
