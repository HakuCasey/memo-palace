import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { episodicRoutes } from '../episodic.js';

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(episodicRoutes);
  return { app, db };
}

const sampleInput = {
  source: 'manual' as const,
  episodic_type: 'debug_case' as const,
  title: 'Test error case',
  trigger: {
    error_signals: ['stack_trace'],
    error_code: '907135702',
    error_message: 'Something went wrong',
    scenario: 'unit test',
  },
  tags: {
    keywords: ['test'],
    severity: 'major' as const,
    bug_type: ['logic'],
  },
};

describe('Episodic CRUD routes', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;

  beforeEach(async () => {
    const built = buildApp();
    app = built.app;
    db = built.db;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe('POST /api/episodic', () => {
    it('creates an episodic memory and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: sampleInput,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^ep_manual_/);
      expect(body.status).toBe('open');
      expect(body.consolidation.promoted_to_semantic).toBe(false);
      expect(body.consolidation.related_semantic_ids).toEqual([]);
      expect(body.title).toBe(sampleInput.title);
      expect(body.trigger).toEqual(sampleInput.trigger);
      expect(body.tags).toEqual(sampleInput.tags);
      expect(body.context).toBeDefined();
      expect(body.context.timestamp).toBeDefined();
    });
  });

  describe('GET /api/episodic', () => {
    it('returns an array of episodic memories', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: sampleInput,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/episodic',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);
      expect(body[0].id).toMatch(/^ep_manual_/);
    });

    it('filters by status', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: sampleInput,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/episodic?status=resolved',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.length).toBe(0);
    });
  });

  describe('GET /api/episodic/:id', () => {
    it('returns 200 for existing record', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'GET',
        url: `/api/episodic/${id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(id);
    });

    it('returns 404 for missing record', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/episodic/ep_manual_nonexistent',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/episodic/:id', () => {
    it('resolves with error_code: group_key = error_code', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const resolution = {
        category: 'api_usage',
        root_cause: 'bad param',
        fix_strategy: 'repair',
        fix_description: 'Fixed the param',
      };

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/episodic/${id}`,
        payload: { status: 'resolved', resolution },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('resolved');
      expect(body.consolidation.group_key).toBe('907135702');
    });

    it('resolves without error_code: group_key = category::fix_strategy', async () => {
      const inputNoCode = {
        ...sampleInput,
        trigger: {
          error_signals: ['stack_trace'],
          error_message: 'Something went wrong',
          scenario: 'unit test',
        },
      };

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/episodic',
        payload: inputNoCode,
      });
      const { id } = createRes.json();

      const resolution = {
        category: 'api_usage',
        root_cause: 'bad param',
        fix_strategy: 'repair',
        fix_description: 'Fixed the param',
      };

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/episodic/${id}`,
        payload: { status: 'resolved', resolution },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('resolved');
      expect(body.consolidation.group_key).toBe('api_usage::repair');
    });
  });
});
