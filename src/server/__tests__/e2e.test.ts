import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { episodicRoutes } from '../routes/episodic.js';
import { semanticRoutes } from '../routes/semantic.js';
import { proceduralRoutes } from '../routes/procedural.js';
import { searchRoutes } from '../routes/search.js';
import { evolutionRoutes } from '../routes/evolution.js';
import { systemRoutes } from '../routes/system.js';
import type { CreateEpisodicInput } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildApp(tempDir: string) {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(episodicRoutes);
  app.register(semanticRoutes);
  app.register(proceduralRoutes, { proceduralDir: tempDir });
  app.register(searchRoutes);
  app.register(evolutionRoutes);
  app.register(systemRoutes);
  return { app, db };
}

interface CandidatePayload {
  id: string;
  source_channel: string;
  source_file: string;
  title: string;
  tags: string[];
  question?: string;
  answer?: string;
  problem?: string;
  solution?: string;
  evidence?: string;
  signals?: string[];
  content?: string;
  source_url?: string;
  created_at?: string;
}

function candidateToEpisodicInput(c: CandidatePayload): CreateEpisodicInput {
  const mainText = [c.question, c.answer, c.problem, c.solution, c.content]
    .filter(Boolean)
    .join('\n');
  return {
    source: 'crawler',
    episodic_type: 'debug_case',
    title: c.title || '(untitled)',
    trigger: {
      error_signals: c.signals ?? [],
      error_code: undefined,
      error_message: mainText.slice(0, 200),
      scenario: c.source_channel,
    },
    tags: {
      keywords: c.tags ?? [],
      severity: 'minor',
      bug_type: [],
    },
  };
}

function loadCandidatesFromJsonl(n: number): CreateEpisodicInput[] {
  const casesPath = path.resolve(
    __dirname,
    '../../assets/pipeline/evolved/high_value.jsonl',
  );
  const content = fs.readFileSync(casesPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== '');
  return lines.slice(0, n).map((line) => {
    const raw = JSON.parse(line);
    const payload: CandidatePayload = raw.payload ?? raw;
    return candidateToEpisodicInput(payload);
  });
}

async function importEpisodic(app: ReturnType<typeof Fastify>, inputs: CreateEpisodicInput[]): Promise<number> {
  let count = 0;
  for (const input of inputs) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/episodic',
      payload: input,
    });
    if (res.statusCode === 201) count++;
  }
  return count;
}

describe('End-to-end integration', () => {
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

  it('imports cases, searches, triggers evolution, confirms task, and creates semantic memory', async () => {
    const inputs = loadCandidatesFromJsonl(7);
    expect(inputs.length).toBe(7);

    const imported = await importEpisodic(app, inputs);
    expect(imported).toBe(7);

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/status',
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().memory_counts.episodic).toBe(7);

    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'HarmonyOS' },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json();
    expect(searchBody.episodic.length).toBeGreaterThanOrEqual(1);

    const analyzeRes = await app.inject({
      method: 'POST',
      url: '/api/evolution/analyze',
    });
    expect(analyzeRes.statusCode).toBe(200);

    const tasksRes = await app.inject({
      method: 'GET',
      url: '/api/evolution/tasks',
    });
    expect(tasksRes.statusCode).toBe(200);
    const tasks = tasksRes.json();
    expect(Array.isArray(tasks)).toBe(true);

    const consolidateTask = tasks.find(
      (t: any) =>
        t.type === 'consolidate_same_code' || t.type === 'consolidate_same_category',
    );

    if (consolidateTask) {
      const confirmRes = await app.inject({
        method: 'POST',
        url: `/api/evolution/tasks/${consolidateTask.id}/confirm`,
      });
      expect(confirmRes.statusCode).toBe(200);
      const confirmedBody = confirmRes.json();
      expect(confirmedBody.status).toBe('executed');
      expect(confirmedBody.result_id).toBeDefined();

      const semanticRes = await app.inject({
        method: 'GET',
        url: '/api/semantic',
      });
      expect(semanticRes.statusCode).toBe(200);
      const semanticList = semanticRes.json();
      expect(semanticList.length).toBeGreaterThanOrEqual(1);
      expect(semanticList[0].source_type).toBe('consolidated');
    }
  });

  it('imports cases and verifies search across layers', async () => {
    const inputs = loadCandidatesFromJsonl(3);

    await importEpisodic(app, inputs);

    const episodicRes = await app.inject({
      method: 'GET',
      url: '/api/episodic',
    });
    expect(episodicRes.statusCode).toBe(200);
    expect(episodicRes.json().length).toBe(3);

    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { query: 'HarmonyOS', layer: 'episodic' },
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().episodic.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.json().semantic).toEqual([]);
    expect(searchRes.json().procedural).toEqual([]);
  });

  it('handles evolution consolidation flow with duplicate error codes', async () => {
    const inputs = loadCandidatesFromJsonl(7);

    await importEpisodic(app, inputs);

    const analyzeRes = await app.inject({
      method: 'POST',
      url: '/api/evolution/analyze',
    });
    expect(analyzeRes.statusCode).toBe(200);

    const tasksRes = await app.inject({
      method: 'GET',
      url: '/api/evolution/tasks',
    });
    const tasks = tasksRes.json();

    const consolidateTasks = tasks.filter(
      (t: any) => t.type.startsWith('consolidate_'),
    );

    for (const task of consolidateTasks) {
      const confirmRes = await app.inject({
        method: 'POST',
        url: `/api/evolution/tasks/${task.id}/confirm`,
      });
      expect(confirmRes.statusCode).toBe(200);
      expect(confirmRes.json().status).toBe('executed');
    }

    if (consolidateTasks.length > 0) {
      const semanticRes = await app.inject({
        method: 'GET',
        url: '/api/semantic',
      });
      const semanticList = semanticRes.json();
      expect(semanticList.length).toBeGreaterThanOrEqual(1);

      const searchRes = await app.inject({
        method: 'POST',
        url: '/api/search',
        payload: { query: 'push' },
      });
      expect(searchRes.statusCode).toBe(200);
      const body = searchRes.json();
      const hasSemanticResults = body.semantic.length > 0;
      expect(hasSemanticResults || body.episodic.length > 0).toBe(true);
    }
  });
});
