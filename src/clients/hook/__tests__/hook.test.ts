import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../../../server/db/connection.js';
import { initSchema } from '../../../server/db/schema.js';
import { episodicRoutes } from '../../../server/routes/episodic.js';
import { semanticRoutes } from '../../../server/routes/semantic.js';
import { proceduralRoutes } from '../../../server/routes/procedural.js';
import { searchRoutes } from '../../../server/routes/search.js';
import { evolutionRoutes } from '../../../server/routes/evolution.js';
import { systemRoutes } from '../../../server/routes/system.js';
import { MemoPalaceClient } from '../../api-client.js';
import { handleBuildFailure, handleFixSuccess, handleSessionStart } from '../events.js';
import type BetterSqlite3 from 'better-sqlite3';

function buildFullApp(tempDir: string) {
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

describe('Hook Event Handlers', () => {
  let app: ReturnType<typeof Fastify>;
  let db: BetterSqlite3.Database;
  let baseUrl: string;
  let client: MemoPalaceClient;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memopalace-proc-'));
    const built = buildFullApp(tempDir);
    app = built.app;
    db = built.db;
    await app.ready();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
    client = new MemoPalaceClient(baseUrl);
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  describe('handleBuildFailure', () => {
    it('calls client.search() with error signals and returns formatted suggestions', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Build failure test',
        trigger: {
          error_signals: ['stack_trace'],
          error_code: 'ERR_BUILD_001',
          error_message: 'Build failed with exit code 1',
          scenario: 'build',
        },
        resolution: {
          category: 'build_config',
          root_cause: 'missing dependency',
          fix_strategy: 'install',
          fix_description: 'Install the missing dependency',
        },
        tags: {
          keywords: ['build'],
          severity: 'major',
          bug_type: ['dependency'],
        },
      });

      const result = await handleBuildFailure(client, {
        error_code: 'ERR_BUILD_001',
        error_signals: ['stack_trace'],
        error_message: 'Build failed with exit code 1',
      });

      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(result.suggestions[0].id).toMatch(/^ep_manual_/);
      expect(result.suggestions[0].title).toBe('Build failure test');
      expect(result.suggestions[0].relevance).toBe('exact');
      expect(result.suggestions[0].resolution).toBeDefined();
      expect(result.suggestions[0].resolution?.fix_description).toBe('Install the missing dependency');
    });

    it('sorts suggestions by relevance: exact > signal > fts', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'FTS only match',
        trigger: {
          error_signals: ['log_output'],
          error_code: 'ERR_DIFFERENT',
          error_message: 'Some unrelated error',
          scenario: 'test',
        },
        tags: { keywords: ['test'], severity: 'minor', bug_type: ['logic'] },
      });

      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Exact code match',
        trigger: {
          error_signals: ['stack_trace'],
          error_code: 'ERR_SORT_TEST',
          error_message: 'Error with specific code',
          scenario: 'build',
        },
        resolution: {
          category: 'build_config',
          root_cause: 'config error',
          fix_strategy: 'repair',
          fix_description: 'Fix the config',
        },
        tags: { keywords: ['build'], severity: 'major', bug_type: ['config'] },
      });

      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Signal match only',
        trigger: {
          error_signals: ['stack_trace'],
          error_code: 'ERR_OTHER',
          error_message: 'Different error message',
          scenario: 'runtime',
        },
        tags: { keywords: ['runtime'], severity: 'minor', bug_type: ['runtime'] },
      });

      const result = await handleBuildFailure(client, {
        error_code: 'ERR_SORT_TEST',
        error_signals: ['stack_trace'],
        error_message: 'Error with specific code',
      });

      const relevanceOrder = result.suggestions.map((s) => s.relevance);
      const exactIdx = relevanceOrder.indexOf('exact');
      const signalIdx = relevanceOrder.indexOf('signal');
      const ftsIdx = relevanceOrder.indexOf('fts');

      if (exactIdx !== -1 && signalIdx !== -1) expect(exactIdx).toBeLessThan(signalIdx);
      if (signalIdx !== -1 && ftsIdx !== -1) expect(signalIdx).toBeLessThan(ftsIdx);
      if (exactIdx !== -1 && ftsIdx !== -1) expect(exactIdx).toBeLessThan(ftsIdx);
    });

    it('returns empty suggestions when no matches found', async () => {
      const result = await handleBuildFailure(client, {
        error_code: 'NONEXISTENT_CODE',
        error_signals: ['nonexistent_signal'],
        error_message: 'No match for this error',
      });

      expect(result.suggestions).toEqual([]);
      expect(result.semantic_count).toBe(0);
      expect(result.procedural_count).toBe(0);
    });

    it('works without error_code', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Signal only test',
        trigger: {
          error_signals: ['crash_log'],
          error_code: '',
          error_message: 'App crashed unexpectedly',
          scenario: 'runtime',
        },
        tags: { keywords: ['crash'], severity: 'critical', bug_type: ['crash'] },
      });

      const result = await handleBuildFailure(client, {
        error_signals: ['crash_log'],
        error_message: 'App crashed unexpectedly',
      });

      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(result.suggestions[0].title).toBe('Signal only test');
    });
  });

  describe('handleFixSuccess', () => {
    it('creates a resolved episodic when no matching open episodic exists', async () => {
      const result = await handleFixSuccess(client, {
        title: 'Fix: API parameter error',
        trigger: {
          error_signals: ['stack_trace'],
          error_code: 'ERR_FIX_NEW',
          error_message: 'Bad API parameter',
          scenario: 'api call',
        },
        resolution: {
          category: 'api_usage',
          root_cause: 'invalid parameter',
          fix_strategy: 'repair',
          fix_description: 'Corrected the API parameter',
        },
      });

      expect(result.action).toBe('created');
      expect(result.id).toMatch(/^ep_opencode_hook_/);

      const fetched = await client.getEpisodic(result.id);
      expect(fetched.status).toBe('resolved');
      expect(fetched.resolution?.fix_description).toBe('Corrected the API parameter');
      expect(fetched.source).toBe('opencode_hook');
    });

    it('updates existing open episodic to resolved when matching error_code found', async () => {
      const created = await client.createEpisodic({
        source: 'opencode_hook',
        episodic_type: 'debug_case',
        title: 'Open bug: timeout error',
        trigger: {
          error_signals: ['timeout'],
          error_code: 'ERR_TIMEOUT_001',
          error_message: 'Request timed out',
          scenario: 'network',
        },
        tags: { keywords: ['timeout'], severity: 'major', bug_type: ['network'] },
      });

      expect(created.status).toBe('open');

      const result = await handleFixSuccess(client, {
        title: 'Fix: timeout error',
        trigger: {
          error_signals: ['timeout'],
          error_code: 'ERR_TIMEOUT_001',
          error_message: 'Request timed out',
          scenario: 'network',
        },
        resolution: {
          category: 'network',
          root_cause: 'connection timeout',
          fix_strategy: 'retry',
          fix_description: 'Added retry logic with backoff',
        },
      });

      expect(result.action).toBe('updated');
      expect(result.id).toBe(created.id);

      const fetched = await client.getEpisodic(created.id);
      expect(fetched.status).toBe('resolved');
      expect(fetched.resolution?.fix_description).toBe('Added retry logic with backoff');
    });

    it('updates existing open episodic to resolved when matching error_signals found', async () => {
      const created = await client.createEpisodic({
        source: 'opencode_hook',
        episodic_type: 'debug_case',
        title: 'Open bug: crash',
        trigger: {
          error_signals: ['crash_log', 'core_dump'],
          error_code: '',
          error_message: 'Application crashed',
          scenario: 'production',
        },
        tags: { keywords: ['crash'], severity: 'critical', bug_type: ['crash'] },
      });

      expect(created.status).toBe('open');

      const result = await handleFixSuccess(client, {
        title: 'Fix: crash issue',
        trigger: {
          error_signals: ['crash_log'],
          error_code: '',
          error_message: 'Application crashed',
          scenario: 'production',
        },
        resolution: {
          category: 'memory',
          root_cause: 'null pointer dereference',
          fix_strategy: 'repair',
          fix_description: 'Added null check before access',
        },
      });

      expect(result.action).toBe('updated');
      expect(result.id).toBe(created.id);

      const fetched = await client.getEpisodic(created.id);
      expect(fetched.status).toBe('resolved');
    });

    it('creates new resolved episodic when existing episodic is already resolved', async () => {
      const created = await client.createEpisodic({
        source: 'opencode_hook',
        episodic_type: 'debug_case',
        title: 'Already fixed bug',
        trigger: {
          error_signals: ['log_output'],
          error_code: 'ERR_ALREADY_FIXED',
          error_message: 'Previously fixed error',
          scenario: 'test',
        },
        resolution: {
          category: 'test',
          root_cause: 'old bug',
          fix_strategy: 'repair',
          fix_description: 'Old fix',
        },
        tags: { keywords: ['test'], severity: 'minor', bug_type: ['logic'] },
      });

      await client.updateEpisodic(created.id, { status: 'resolved' });

      const result = await handleFixSuccess(client, {
        title: 'Fix: same error again',
        trigger: {
          error_signals: ['log_output'],
          error_code: 'ERR_ALREADY_FIXED',
          error_message: 'Previously fixed error',
          scenario: 'test',
        },
        resolution: {
          category: 'test',
          root_cause: 'regression',
          fix_strategy: 'repair',
          fix_description: 'Re-applied the fix',
        },
      });

      expect(result.action).toBe('created');
      expect(result.id).not.toBe(created.id);
    });
  });

  describe('handleSessionStart', () => {
    it('calls client.selfCheck() and returns status', async () => {
      const result = await handleSessionStart(client);

      expect(result.connectivity).toBe('OK');
      expect(result.db_health).toBe('OK');
      expect(result.memory_stats).toBeDefined();
      expect(result.memory_stats.episodic).toBe(0);
      expect(result.memory_stats.semantic).toBe(0);
      expect(result.memory_stats.procedural).toBe(0);
    });

    it('reports memory counts after data exists', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Session start test',
        trigger: {
          error_signals: ['log_output'],
          error_code: 'ERR_SESSION',
          error_message: 'Session test error',
          scenario: 'test',
        },
        tags: { keywords: ['test'], severity: 'minor', bug_type: ['logic'] },
      });

      const result = await handleSessionStart(client);

      expect(result.connectivity).toBe('OK');
      expect(result.memory_stats.episodic).toBe(1);
    });
  });
});
