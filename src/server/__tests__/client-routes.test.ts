import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { systemRoutes } from '../routes/system.js';
import { searchRoutes } from '../routes/search.js';
import { ensureClient } from '../services/client-registry.js';

describe('Client routes', () => {
  let app: ReturnType<typeof Fastify>;
  let db: any;

  beforeEach(async () => {
    app = Fastify();
    db = createDb(':memory:');
    initSchema(db);
    app.decorate('db', db);
    app.register(systemRoutes);
    app.register(searchRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('GET /api/clients returns empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/clients' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /api/self-check/run returns checks', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/self-check/run' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks.db_connection).toBe('OK');
    expect(body.checks.tables).toBe('OK');
    expect(body.checked_at).toBeDefined();
  });

  it('GET /api/access/stats returns zeros for empty log', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().today_search_count).toBe(0);
    expect(res.json().hot_queries).toEqual([]);
  });

  it('GET /api/access/recent returns empty items for empty log', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/recent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('search records access log', async () => {
    // Register a client first
    const clientId = ensureClient(db, undefined, 'memopalace-cli/0.1.0');

    // Create a memory to search for
    db.prepare(`
      INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, context_json, tags_json, consolidation_json)
      VALUES ('ep_test', 'debug_case', 'manual', 'Test', 'open', '{}', '{}', '{}', '{}')
    `).run();

    // Search
    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/search',
      headers: { 'X-Client-ID': clientId },
      payload: { query: 'Test' },
    });
    expect(searchRes.statusCode).toBe(200);

    // Check access log
    const statsRes = await app.inject({ method: 'GET', url: '/api/access/stats' });
    expect(statsRes.json().today_search_count).toBe(1);

    const recentRes = await app.inject({ method: 'GET', url: '/api/access/recent' });
    expect(recentRes.json().items.length).toBe(1);
    expect(recentRes.json().items[0].query).toBe('Test');
  });
});
