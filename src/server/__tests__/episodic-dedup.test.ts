import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
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

describe('Episodic check-dup', () => {
  let app: ReturnType<typeof Fastify>;
  let db: ReturnType<typeof createDb>;

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

  async function createEpisodic(title: string) {
    return app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: {
        episodic_type: 'debug_case',
        source: 'manual',
        title,
        trigger: { error_signals: [], error_message: '', scenario: 'test' },
      },
    });
  }

  it('returns duplicate:false when no match', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: { title: 'No such title' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ duplicate: false });
  });

  it('returns duplicate:true with existing_id when exact title match', async () => {
    const createRes = await createEpisodic('DevEco Studio download issue');
    const createdId = createRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: { title: 'DevEco Studio download issue' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.duplicate).toBe(true);
    expect(body.existing_id).toBe(createdId);
  });

  it('returns duplicate:false for similar but not identical title', async () => {
    await createEpisodic('DevEco Studio download');

    const res = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: { title: 'DevEco Studio download issue' },
    });
    expect(res.json().duplicate).toBe(false);
  });

  it('returns duplicate:false for empty or missing title', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: { title: '' },
    });
    expect(res1.json().duplicate).toBe(false);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: {},
    });
    expect(res2.json().duplicate).toBe(false);
  });

  it('handles title with special characters', async () => {
    await createEpisodic("It's a bug with 100% failure");

    const res = await app.inject({
      method: 'POST',
      url: '/api/episodic/check-dup',
      payload: { title: "It's a bug with 100% failure" },
    });
    expect(res.json().duplicate).toBe(true);
  });
});
