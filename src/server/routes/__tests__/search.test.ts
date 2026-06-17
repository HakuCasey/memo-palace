import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { searchRoutes } from '../search.js';
import { episodicRoutes } from '../episodic.js';
import { semanticRoutes } from '../semantic.js';
import { proceduralRoutes } from '../procedural.js';

function buildApp(tempDir: string) {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(episodicRoutes);
  app.register(semanticRoutes);
  app.register(proceduralRoutes, { proceduralDir: tempDir });
  app.register(searchRoutes);
  return { app, db };
}

async function seedData(app: ReturnType<typeof Fastify>) {
  await app.inject({
    method: 'POST',
    url: '/api/episodic',
    payload: {
      source: 'opencode_hook',
      episodic_type: 'debug_case',
      title: 'HarmonyOS 907135702 crash',
      trigger: {
        error_signals: ['stack_trace', 'null_pointer'],
        error_code: '907135702',
        error_message: 'NullPointerException in main thread',
        scenario: 'runtime crash',
      },
      resolution: {
        category: 'api_usage',
        root_cause: 'missing null check',
        fix_strategy: 'repair',
        fix_description: 'Added null check before access',
      },
      tags: {
        keywords: ['null', 'crash', 'harmony'],
        severity: 'critical',
        bug_type: ['logic'],
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/api/episodic',
    payload: {
      source: 'manual',
      episodic_type: 'debug_case',
      title: 'UI rendering glitch',
      trigger: {
        error_signals: ['ui_artifact'],
        error_message: 'Flickering on scroll',
        scenario: 'ui bug',
      },
      tags: {
        keywords: ['ui', 'render'],
        severity: 'minor',
        bug_type: ['visual'],
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/api/semantic',
    payload: {
      title: 'Null safety patterns',
      semantic_type: 'pattern',
      knowledge: 'Always check for null before accessing object members in ArkTS',
      source_type: 'consolidated',
      source_episodic_ids: [],
      conditions: {
        applicable_context: ['ArkTS', 'HarmonyOS'],
        error_codes: ['907135702'],
      },
      category: 'api_usage',
      confidence: 0.9,
      tags: ['null', 'safety', 'ArkTS'],
    },
  });

  await app.inject({
    method: 'POST',
    url: '/api/procedural',
    payload: {
      name: 'Auto-suggest null check',
      description: 'When a NullPointerException is detected, suggest null safety pattern',
      procedural_type: 'skill',
      trigger: {
        type: 'error_signal',
        pattern: 'NullPointerException null_pointer',
        conditions: ['runtime'],
      },
      actions: [
        { type: 'suggest', target: 'null_safety_pattern' },
      ],
      enabled: true,
      priority: 10,
    },
  });
}

describe('Search routes', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memopalace-proc-'));
    const built = buildApp(tempDir);
    app = built.app;
    db = built.db;
    await app.ready();
    await seedData(app);
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('POST /api/search - returns results from all layers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'null pointer crash' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.procedural).toBeDefined();
    expect(body.semantic).toBeDefined();
    expect(body.episodic).toBeDefined();
  });

  it('POST /api/search - error_code match ranks episodic result first', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: '907135702' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.episodic.length).toBeGreaterThanOrEqual(1);
    expect(body.episodic[0].trigger.error_code).toBe('907135702');
  });

  it('POST /api/search with layer=semantic - returns only semantic results', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'null safety', layer: 'semantic' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.semantic.length).toBeGreaterThanOrEqual(1);
    expect(body.episodic).toEqual([]);
    expect(body.procedural).toEqual([]);
  });

  it('POST /api/search - procedural always returns empty (file-based)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'NullPointerException detected' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.procedural).toEqual([]);
  });

  it('POST /api/search - results from semantic and episodic layers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'null' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const hasSemantic = body.semantic.length > 0;
    const hasEpisodic = body.episodic.length > 0;

    expect(hasSemantic || hasEpisodic).toBe(true);
    if (hasSemantic) {
      expect(body.semantic.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('POST /api/search with limit - respects limit per layer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'null', limit: 1 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.episodic.length).toBeLessThanOrEqual(1);
    expect(body.semantic.length).toBeLessThanOrEqual(1);
    expect(body.procedural.length).toBeLessThanOrEqual(1);
  });
});
