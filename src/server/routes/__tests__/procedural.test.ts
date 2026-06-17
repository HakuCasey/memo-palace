import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { proceduralRoutes } from '../procedural.js';

function buildApp(tempDir: string) {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(proceduralRoutes, { proceduralDir: tempDir });
  return { app, db };
}

const sampleInput = {
  name: 'Auto-search on error',
  description: 'Search knowledge base when an error signal is detected',
  procedural_type: 'skill' as const,
  trigger: {
    type: 'error_signal' as const,
    pattern: 'ECONNREFUSED',
    conditions: ['network_error'],
  },
  actions: [
    {
      type: 'search' as const,
      target: 'semantic',
      params: { query: 'ECONNREFUSED' },
    },
  ],
  source_semantic_ids: ['sm_network_abc12345'],
  enabled: true,
  priority: 1,
};

describe('Procedural CRUD routes', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memopalace-proc-'));
    const built = buildApp(tempDir);
    app = built.app;
    db = built.db;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  describe('POST /api/procedural', () => {
    it('creates a procedural memory and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: sampleInput,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^pm_skill_/);
      expect(body.name).toBe(sampleInput.name);
      expect(body.description).toBe(sampleInput.description);
      expect(body.trigger).toEqual(sampleInput.trigger);
      expect(body.actions).toEqual(sampleInput.actions);
      expect(body.source_semantic_ids).toEqual(sampleInput.source_semantic_ids);
      expect(body.enabled).toBe(true);
      expect(body.priority).toBe(1);
      expect(body.stats).toBeDefined();
      expect(body.stats.triggered_count).toBe(0);
      expect(body.stats.success_count).toBe(0);
    });

    it('applies stats defaults', async () => {
      const input = {
        name: 'Minimal procedural',
        description: 'A minimal rule',
        procedural_type: 'workflow' as const,
        trigger: {
          type: 'keyword' as const,
          pattern: 'test',
        },
        actions: [
          {
            type: 'notify' as const,
            target: 'user',
          },
        ],
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: input,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^pm_workflow_/);
      expect(body.stats.triggered_count).toBe(0);
      expect(body.stats.success_count).toBe(0);
      expect(body.enabled).toBe(true);
      expect(body.priority).toBe(0);
      expect(body.source_semantic_ids).toEqual([]);
    });
  });

  describe('GET /api/procedural', () => {
    it('returns an array of procedural memories', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'GET',
        url: '/api/procedural',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((p: any) => p.id === id)).toBe(true);
    });
  });

  describe('GET /api/procedural/:id', () => {
    it('returns 200 for existing record', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'GET',
        url: `/api/procedural/${id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(id);
    });

    it('returns 404 for missing record', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/procedural/pm_error_signal_nonexistent',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/procedural/:id', () => {
    it('toggles enabled and updates trigger + actions', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const newTrigger = {
        type: 'keyword' as const,
        pattern: 'ETIMEDOUT',
        conditions: ['timeout'],
      };
      const newActions = [
        {
          type: 'suggest' as const,
          target: 'semantic',
          params: { query: 'timeout' },
        },
      ];

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/procedural/${id}`,
        payload: { enabled: false, trigger: newTrigger, actions: newActions },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enabled).toBe(false);
      expect(body.trigger).toEqual(newTrigger);
      expect(body.actions).toEqual(newActions);
    });

    it('returns 404 for missing record', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/procedural/pm_skill_nonexistent',
        payload: { enabled: false },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/procedural/:id', () => {
    it('deletes a procedural memory and returns 204', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/procedural',
        payload: sampleInput,
      });
      const { id } = createRes.json();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/procedural/${id}`,
      });

      expect(res.statusCode).toBe(204);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/procedural/${id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });
});
