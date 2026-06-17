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
import { handleSearch, handleUpload, handleSelfCheck, handleStatus } from '../tools.js';
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

const sampleTrigger = {
  error_signals: ['stack_trace'],
  error_code: '907135702',
  error_message: 'Test error message',
  scenario: 'mcp test',
};

describe('MCP Tool Handlers', () => {
  let app: ReturnType<typeof Fastify>;
  let db: BetterSqlite3.Database;
  let client: MemoPalaceClient;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memopalace-proc-'));
    const built = buildFullApp(tempDir);
    app = built.app;
    db = built.db;
    await app.ready();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new MemoPalaceClient(address);
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  describe('handleSearch', () => {
    it('calls client.search and returns formatted results', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Search test error',
        trigger: sampleTrigger,
      });

      const result = await handleSearch({ query: '907135702' }, client);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.episodic).toBeDefined();
      expect(parsed.episodic.length).toBeGreaterThanOrEqual(1);
    });

    it('passes layer and limit options to client.search', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Layer test error',
        trigger: sampleTrigger,
      });

      const result = await handleSearch({ query: '907135702', layer: 'episodic', limit: 5 }, client);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.episodic.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('handleUpload', () => {
    it('calls client.createEpisodic and returns created memory', async () => {
      const result = await handleUpload({
        title: 'MCP upload test',
        trigger: sampleTrigger,
      }, client);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.id).toMatch(/^ep_manual_/);
      expect(parsed.title).toBe('MCP upload test');
      expect(parsed.status).toBe('open');
    });

    it('includes resolution when provided', async () => {
      const result = await handleUpload({
        title: 'MCP upload with resolution',
        trigger: sampleTrigger,
        resolution: {
          category: 'api_usage',
          root_cause: 'bad param',
          fix_strategy: 'repair',
          fix_description: 'Fixed the param',
        },
      }, client);

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.resolution).toBeDefined();
      expect(parsed.resolution.category).toBe('api_usage');
    });
  });

  describe('handleSelfCheck', () => {
    it('calls client.selfCheck and returns health info', async () => {
      const result = await handleSelfCheck(client);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.connectivity).toBe('OK');
      expect(parsed.db_health).toBe('OK');
      expect(parsed.memory_stats).toBeDefined();
    });
  });

  describe('handleStatus', () => {
    it('calls client.getStatus and returns server status', async () => {
      await client.createEpisodic({
        source: 'manual',
        episodic_type: 'debug_case',
        title: 'Status test error',
        trigger: sampleTrigger,
      });

      const result = await handleStatus(client);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.uptime).toBeDefined();
      expect(typeof parsed.uptime).toBe('number');
      expect(parsed.memory_counts.episodic).toBe(1);
      expect(parsed.memory_counts.semantic).toBe(0);
      expect(parsed.memory_counts.procedural).toBe(0);
    });
  });
});
