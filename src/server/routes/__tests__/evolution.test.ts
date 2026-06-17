import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { evolutionRoutes } from '../evolution.js';
import { Analyzer } from '../../services/analyzer.js';
import { Evolver } from '../../services/evolver.js';

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  return { app, db };
}

function insertEpisodic(
  db: Database.Database,
  opts: {
    id: string;
    source?: string;
    title?: string;
    status?: string;
    error_code?: string;
    error_message?: string;
    error_signals?: string[];
    category?: string;
    fix_strategy?: string;
    root_cause?: string;
    fix_description?: string;
    group_key?: string;
    promoted_to_semantic?: boolean;
    related_semantic_ids?: string[];
    created_at?: string;
  },
) {
  const {
    id,
    source = 'manual',
    title = 'Test error',
    status = 'open',
    error_code,
    error_message = 'Something went wrong',
    error_signals = ['stack_trace'],
    category,
    fix_strategy,
    root_cause,
    fix_description,
    group_key = null,
    promoted_to_semantic = false,
    related_semantic_ids = [],
    created_at,
  } = opts;

  const trigger: Record<string, unknown> = {
    error_signals,
    error_message,
    scenario: 'test',
  };
  if (error_code) trigger.error_code = error_code;

  const resolution =
    category && fix_strategy
      ? { category, root_cause: root_cause ?? 'test cause', fix_strategy, fix_description: fix_description ?? 'test fix' }
      : null;

  const consolidation = {
    promoted_to_semantic,
    related_semantic_ids,
    ...(group_key !== null ? { group_key } : {}),
  };

  const context = { timestamp: new Date().toISOString() };
  const tags = { keywords: [], severity: 'minor' as const, bug_type: [] };

  const cols = 'id, episodic_type, source, title, status, trigger_json, resolution_json, context_json, tags_json, consolidation_json, group_key';
  const placeholders = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
  const params: unknown[] = [
    id, 'debug_case', source, title, status,
    JSON.stringify(trigger),
    resolution ? JSON.stringify(resolution) : null,
    JSON.stringify(context),
    JSON.stringify(tags),
    JSON.stringify(consolidation),
    group_key,
  ];

  if (created_at) {
    db.prepare('INSERT INTO episodic_memory (' + cols + ', created_at) VALUES (' + placeholders + ', ?)').run(...params, created_at);
  } else {
    db.prepare('INSERT INTO episodic_memory (' + cols + ') VALUES (' + placeholders + ')').run(...params);
  }
}

describe('Evolution routes', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;

  beforeEach(async () => {
    const built = buildApp();
    app = built.app;
    db = built.db;
    app.register(evolutionRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe('Analyzer - SameCodeRule', () => {
    it('produces consolidate_same_code task when 3+ episodic share same error_code', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      const count = analyzer.scan(db);
      expect(count).toBeGreaterThanOrEqual(1);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_code' AND status = 'pending'").all() as Record<string, unknown>[];
      expect(tasks.length).toBe(1);
      const sourceIds = JSON.parse(tasks[0].source_ids_json as string) as string[];
      expect(sourceIds).toEqual(expect.arrayContaining(['ep_1', 'ep_2', 'ep_3']));
    });

    it('does not produce task when fewer than 3 episodic share error_code', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      analyzer.scan(db);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_code'").all();
      expect(tasks.length).toBe(0);
    });

    it('skips if pending task already exists for same type + source_ids', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      const count1 = analyzer.scan(db);
      const count2 = analyzer.scan(db);
      expect(count1).toBeGreaterThanOrEqual(1);
      expect(count2).toBe(0);
    });
  });

  describe('Analyzer - SameCategoryRule', () => {
    it('produces consolidate_same_category task for category::fix_strategy group with >=3', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_c1', status: 'resolved', category: 'api_usage', fix_strategy: 'repair', group_key: 'api_usage::repair' });
      insertEpisodic(db, { id: 'ep_c2', status: 'resolved', category: 'api_usage', fix_strategy: 'repair', group_key: 'api_usage::repair' });
      insertEpisodic(db, { id: 'ep_c3', status: 'resolved', category: 'api_usage', fix_strategy: 'repair', group_key: 'api_usage::repair' });

      const count = analyzer.scan(db);
      expect(count).toBeGreaterThanOrEqual(1);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_category' AND status = 'pending'").all() as Record<string, unknown>[];
      expect(tasks.length).toBe(1);
      const sourceIds = JSON.parse(tasks[0].source_ids_json as string) as string[];
      expect(sourceIds).toEqual(expect.arrayContaining(['ep_c1', 'ep_c2', 'ep_c3']));
    });

    it('does not produce same_category task when group_key is pure error_code', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      analyzer.scan(db);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_category'").all();
      expect(tasks.length).toBe(0);
    });
  });

  describe('Analyzer - OrphanCleanupRule', () => {
    it('produces archive_orphan task for open episodic older than 30 days', () => {
      const analyzer = new Analyzer();
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      insertEpisodic(db, { id: 'ep_old', status: 'open', created_at: oldDate });

      const count = analyzer.scan(db);
      expect(count).toBeGreaterThanOrEqual(1);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'archive_orphan' AND status = 'pending'").all() as Record<string, unknown>[];
      expect(tasks.length).toBe(1);
      const sourceIds = JSON.parse(tasks[0].source_ids_json as string) as string[];
      expect(sourceIds).toContain('ep_old');
    });

    it('does not produce archive_orphan for recent open episodic', () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_recent', status: 'open' });

      analyzer.scan(db);

      const tasks = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'archive_orphan'").all();
      expect(tasks.length).toBe(0);
    });
  });

  describe('Evolver - consolidate', () => {
    it('creates semantic memory and marks source episodic promoted', () => {
      insertEpisodic(db, { id: 'ep_s1', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param', fix_description: 'fixed param', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_s2', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param 2', fix_description: 'fixed param 2', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_s3', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param 3', fix_description: 'fixed param 3', group_key: '907135702' });

      const analyzer = new Analyzer();
      analyzer.scan(db);

      const task = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_code' AND status = 'pending'").get() as Record<string, unknown>;

      const evolver = new Evolver();
      evolver.consolidate(db, task.id as string);

      const semanticRows = db.prepare('SELECT * FROM semantic_memory').all() as Record<string, unknown>[];
      expect(semanticRows.length).toBe(1);
      const sm = semanticRows[0];
      expect(sm.source_type).toBe('consolidated');
      expect(sm.category).toBe('api_usage');
      expect(sm.confidence).toBe(1.0);
      const sourceEpiIds = JSON.parse(sm.source_episodic_ids_json as string) as string[];
      expect(sourceEpiIds).toEqual(expect.arrayContaining(['ep_s1', 'ep_s2', 'ep_s3']));
      const conditions = JSON.parse(sm.conditions_json as string);
      expect(conditions.error_codes).toContain('907135702');

      const updatedEpi = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get('ep_s1') as Record<string, unknown>;
      const consolidation = JSON.parse(updatedEpi.consolidation_json as string);
      expect(consolidation.promoted_to_semantic).toBe(true);
      expect(consolidation.related_semantic_ids).toContain(sm.id);

      const updatedTask = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(task.id) as Record<string, unknown>;
      expect(updatedTask.status).toBe('executed');
      expect(updatedTask.result_id).toBe(sm.id);
    });
  });

  describe('Evolver - archive', () => {
    it('sets episodic status to archived', () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      insertEpisodic(db, { id: 'ep_orphan', status: 'open', created_at: oldDate });

      const analyzer = new Analyzer();
      analyzer.scan(db);

      const task = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'archive_orphan' AND status = 'pending'").get() as Record<string, unknown>;

      const evolver = new Evolver();
      evolver.archive(db, task.id as string);

      const epi = db.prepare('SELECT * FROM episodic_memory WHERE id = ?').get('ep_orphan') as Record<string, unknown>;
      expect(epi.status).toBe('archived');

      const updatedTask = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(task.id) as Record<string, unknown>;
      expect(updatedTask.status).toBe('executed');
    });
  });

  describe('Evolution API routes', () => {
    it('POST /api/evolution/analyze runs analysis and returns count', async () => {
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      const res = await app.inject({ method: 'POST', url: '/api/evolution/analyze' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.new_tasks).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/evolution/tasks returns pending tasks', async () => {
      const analyzer = new Analyzer();
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      analyzer.scan(db);

      const res = await app.inject({ method: 'GET', url: '/api/evolution/tasks' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].status).toBe('pending');
    });

    it('POST /api/evolution/tasks/:id/confirm confirms and executes task', async () => {
      insertEpisodic(db, { id: 'ep_r1', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param', fix_description: 'fixed param', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_r2', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param 2', fix_description: 'fixed param 2', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_r3', status: 'resolved', error_code: '907135702', category: 'api_usage', fix_strategy: 'repair', root_cause: 'bad param 3', fix_description: 'fixed param 3', group_key: '907135702' });

      const analyzer = new Analyzer();
      analyzer.scan(db);

      const task = db.prepare("SELECT * FROM evolution_tasks WHERE type = 'consolidate_same_code' AND status = 'pending'").get() as Record<string, unknown>;

      const res = await app.inject({ method: 'POST', url: '/api/evolution/tasks/' + (task.id as string) + '/confirm' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('executed');
      expect(body.result_id).toBeDefined();

      const semanticRows = db.prepare('SELECT * FROM semantic_memory').all();
      expect(semanticRows.length).toBe(1);
    });

    it('POST /api/evolution/tasks/:id/reject marks task rejected', async () => {
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      const analyzer = new Analyzer();
      analyzer.scan(db);

      const task = db.prepare("SELECT * FROM evolution_tasks WHERE status = 'pending'").get() as Record<string, unknown>;

      const res = await app.inject({ method: 'POST', url: '/api/evolution/tasks/' + (task.id as string) + '/reject' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('rejected');

      const updatedTask = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(task.id) as Record<string, unknown>;
      expect(updatedTask.status).toBe('rejected');
    });

    it('GET /api/evolution/history returns completed/rejected tasks', async () => {
      insertEpisodic(db, { id: 'ep_1', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_2', status: 'resolved', error_code: '907135702', group_key: '907135702' });
      insertEpisodic(db, { id: 'ep_3', status: 'resolved', error_code: '907135702', group_key: '907135702' });

      const analyzer = new Analyzer();
      analyzer.scan(db);

      const task = db.prepare("SELECT * FROM evolution_tasks WHERE status = 'pending'").get() as Record<string, unknown>;
      await app.inject({ method: 'POST', url: '/api/evolution/tasks/' + (task.id as string) + '/reject' });

      const res = await app.inject({ method: 'GET', url: '/api/evolution/history' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].status).toBe('rejected');
    });
  });
});
