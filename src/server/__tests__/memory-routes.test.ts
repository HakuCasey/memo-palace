import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { episodicRoutes } from '../routes/episodic.js';
import { semanticRoutes } from '../routes/semantic.js';
import { searchRoutes } from '../routes/search.js';
import { memoryRoutes } from '../routes/memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(episodicRoutes);
  app.register(semanticRoutes);
  app.register(searchRoutes);
  app.register(memoryRoutes);
  return { app, db };
}

describe('Memory routes', () => {
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

  it('GET /api/memory/stats returns zeros for empty database', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/memory/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.episodic).toEqual({ total: 0, today: 0 });
    expect(body.semantic).toEqual({ total: 0, today: 0 });
  });

  it('GET /api/memory/hot returns empty array for empty database', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/memory/hot' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('stats reflect created memories', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'Test Case',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/memory/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.episodic.total).toBe(1);
    expect(body.episodic.today).toBe(1);
  });

  it('search increments hit_count and hot reflects it', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'HarmonyOS Weather API',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: ['HarmonyOS'], severity: 'minor', bug_type: [] },
      },
    });
    expect(createRes.statusCode).toBe(201);

    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'HarmonyOS' },
    });
    expect(searchRes.statusCode).toBe(200);

    const hotRes = await app.inject({ method: 'GET', url: '/api/memory/hot' });
    expect(hotRes.statusCode).toBe(200);
    const hotBody = hotRes.json();
    expect(hotBody.items.length).toBe(1);
    expect(hotBody.items[0].hit_count).toBe(1);
    expect(hotBody.items[0].memory.title).toBe('HarmonyOS Weather API');
  });
});
