import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type {
  CreateSemanticInput,
  SemanticMemory,
  UpdateSemanticInput,
} from '../types.js';
import { localNow } from '../db/connection.js';

interface DbRow {
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

function generateId(category: string, title: string): string {
  const content = `${title}:${Date.now()}:${Math.random()}`;
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `sm_${category}_${hash}`;
}

function parseRow(row: DbRow): SemanticMemory {
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

export const semanticRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.post<{ Body: CreateSemanticInput }>(
    '/api/semantic',
    async (req, reply) => {
      const input = req.body;
      const db = app.db as import('better-sqlite3').Database;

      const id = generateId(input.category, input.title);
      const now = localNow();

      const confidence = input.confidence ?? 1.0;
      const tags = input.tags ?? [];
      const sourceEpisodicIds = input.source_episodic_ids ?? [];

      const consolidation = {
        created_at: now,
        match_count: 0,
      };

      const stmt = db.prepare(`
        INSERT INTO semantic_memory (id, semantic_type, title, knowledge, source_type, source_episodic_ids_json, conditions_json, category, confidence, tags_json, consolidation_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        input.semantic_type,
        input.title,
        input.knowledge,
        input.source_type,
        JSON.stringify(sourceEpisodicIds),
        JSON.stringify(input.conditions),
        input.category,
        confidence,
        JSON.stringify(tags),
        JSON.stringify(consolidation),
        now,
        now,
      );

      const row = db.prepare('SELECT * FROM semantic_memory WHERE id = ?').get(id) as DbRow;
      reply.code(201);
      return parseRow(row);
    },
  );

  app.get<{ Querystring: { category?: string; semantic_type?: string; page?: string; limit?: string } }>(
    '/api/semantic',
    async (req) => {
      const db = app.db as import('better-sqlite3').Database;
      const { category, semantic_type, page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 20);
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }
      if (semantic_type) {
        conditions.push('semantic_type = ?');
        params.push(semantic_type);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM semantic_memory ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limitNum, offset) as DbRow[];

      return rows.map(parseRow);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/semantic/:id',
    async (req, reply) => {
      const db = app.db as import('better-sqlite3').Database;
      const row = db.prepare('SELECT * FROM semantic_memory WHERE id = ?').get(req.params.id) as DbRow | undefined;

      if (!row) {
        reply.code(404);
        return { error: 'Not found' };
      }

      return parseRow(row);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateSemanticInput }>(
    '/api/semantic/:id',
    async (req, reply) => {
      const db = app.db as import('better-sqlite3').Database;
      const { id } = req.params;
      const input = req.body;

      const existing = db.prepare('SELECT * FROM semantic_memory WHERE id = ?').get(id) as DbRow | undefined;
      if (!existing) {
        reply.code(404);
        return { error: 'Not found' };
      }

      const existingParsed = parseRow(existing);
      const newTitle = input.title ?? existingParsed.title;
      const newKnowledge = input.knowledge ?? existingParsed.knowledge;
      const newConditions = input.conditions
        ? { ...existingParsed.conditions, ...input.conditions }
        : existingParsed.conditions;
      const newCategory = input.category ?? existingParsed.category;
      const newConfidence = input.confidence ?? existingParsed.confidence;
      const newTags = input.tags ?? existingParsed.tags;
      const consolidation = JSON.parse(existing.consolidation_json);

      const stmt = db.prepare(`
        UPDATE semantic_memory
        SET title = ?, knowledge = ?, conditions_json = ?, category = ?, confidence = ?, tags_json = ?, consolidation_json = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        newTitle,
        newKnowledge,
        JSON.stringify(newConditions),
        newCategory,
        newConfidence,
        JSON.stringify(newTags),
        JSON.stringify(consolidation),
        localNow(),
        id,
      );

      const row = db.prepare('SELECT * FROM semantic_memory WHERE id = ?').get(id) as DbRow;
      return parseRow(row);
    },
  );

  done();
};
