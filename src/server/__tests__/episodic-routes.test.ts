import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { episodicRoutes } from '../routes/episodic.js';

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(episodicRoutes);
  return { app, db };
}

describe('Episodic routes', () => {
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

  it('GET /api/episodic/list-titles returns titles sorted case-insensitively', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'Zebra Error',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'apple bug',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/episodic/list-titles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    expect(body.items[0].title).toBe('apple bug');
    expect(body.items[1].title).toBe('Zebra Error');
  });

  it('DELETE /api/episodic/:id deletes existing record and returns 404 for non-existing', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'To Delete',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });
    const created = createRes.json();

    const delRes = await app.inject({ method: 'DELETE', url: `/api/episodic/${created.id}` });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ deleted: true });

    const getRes = await app.inject({ method: 'GET', url: `/api/episodic/${created.id}` });
    expect(getRes.statusCode).toBe(404);

    const del404 = await app.inject({ method: 'DELETE', url: '/api/episodic/nonexistent-id' });
    expect(del404.statusCode).toBe(404);
    expect(del404.json()).toEqual({ error: 'Not found' });
  });

  it('POST /api/episodic/batch-delete removes multiple records and handles empty input', async () => {
    const create1 = await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'Batch 1',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });
    const create2 = await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title: 'Batch 2',
        trigger: { error_signals: ['err'], error_message: 'test', scenario: 'test' },
        tags: { keywords: [], severity: 'minor', bug_type: [] },
      },
    });
    const id1 = create1.json().id;
    const id2 = create2.json().id;

    const delRes = await app.inject({
      method: 'POST',
      url: '/api/episodic/batch-delete',
      payload: { ids: [id1, id2] },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ deleted_count: 2 });

    const get1 = await app.inject({ method: 'GET', url: `/api/episodic/${id1}` });
    const get2 = await app.inject({ method: 'GET', url: `/api/episodic/${id2}` });
    expect(get1.statusCode).toBe(404);
    expect(get2.statusCode).toBe(404);

    const emptyRes = await app.inject({
      method: 'POST',
      url: '/api/episodic/batch-delete',
      payload: { ids: [] },
    });
    expect(emptyRes.statusCode).toBe(200);
    expect(emptyRes.json()).toEqual({ deleted_count: 0 });
  });
});
