import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { semanticRoutes } from '../semantic.js';

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(semanticRoutes);
  return { app, db };
}

const sampleInput = {
  title: 'Node.js ECONNREFUSED pattern',
  semantic_type: 'pattern' as const,
  knowledge: 'When connecting to a service that is not running, ECONNREFUSED is thrown',
  source_type: 'manual' as const,
  source_episodic_ids: ['ep_manual_abc12345'],
  conditions: {
    applicable_context: ['network', 'nodejs'],
    related_apis: ['net.connect'],
    error_codes: ['ECONNREFUSED'],
  },
  category: 'network',
  confidence: 0.9,
  tags: ['network', 'connection', 'error'],
};

describe('Semantic CRUD routes', () => {
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

  describe('POST /api/semantic', () => {
    it('creates a semantic memory and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/semantic',
        payload: sampleInput,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^sm_network_/);
      expect(body.title).toBe(sampleInput.title);
      expect(body.knowledge).toBe(sampleInput.knowledge);
      expect(body.source_type).toBe('manual');
      expect(body.source_episodic_ids).toEqual(sampleInput.source_episodic_ids);
      expect(body.conditions).toEqual(sampleInput.conditions);
      expect(body.category).toBe('network');
      expect(body.confidence).toBe(0.9);
      expect(body.tags).toEqual(sampleInput.tags);
      expect(body.consolidation).toBeDefined();
      expect(body.consolidation.match_count).toBe(0);
      expect(body.consolidation.created_at).toBeDefined();
    });

    it('applies consolidation defaults when not provided', async () => {
      const input = {
        title: 'Minimal semantic',
        semantic_type: 'pattern' as const,
        knowledge: 'Some knowledge',
        source_type: 'consolidated' as const,
        source_episodic_ids: [] as string[],
        conditions: { applicable_context: ['general'] },
        category: 'general',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/semantic',
        payload: input,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.consolidation.match_count).toBe(0);
      expect(body.consolidation.created_at).toBeDefined();
      expect(body.confidence).toBe(1.0);
      expect(body.tags).toEqual([]);
    });
  });

  describe('GET /api/semantic', () => {
    it('returns an array of semantic memories', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/semantic',
        payload: sampleInput,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/semantic',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);
      expect(body[0].id).toMatch(/^sm_network_/);
      expect(body[0].conditions).toEqual(sampleInput.conditions);
      expect(body[0].tags).toEqual(sampleInput.tags);
    });
  });

  describe('GET /api/semantic/:id', () => {
    it('returns 200 for existing record', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/semantic',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'GET',
        url: `/api/semantic/${id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(id);
    });

    it('returns 404 for missing record', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/semantic/sm_network_nonexistent',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/semantic/:id', () => {
    it('updates confidence and tags', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/semantic',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/semantic/${id}`,
        payload: { confidence: 0.5, tags: ['network', 'updated'] },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.confidence).toBe(0.5);
      expect(body.tags).toEqual(['network', 'updated']);
    });

    it('returns 404 for missing record', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/semantic/sm_network_nonexistent',
        payload: { confidence: 0.5 },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
