import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
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
import { registerSearch } from '../commands/search.js';
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

const sampleEpisodicInput = {
  source: 'manual' as const,
  episodic_type: 'debug_case' as const,
  title: 'CLI test error',
  trigger: {
    error_signals: ['stack_trace'],
    error_code: '907135702',
    error_message: 'CLI test error message',
    scenario: 'cli test',
  },
  tags: {
    keywords: ['test'],
    severity: 'major' as const,
    bug_type: ['logic'],
  },
};

const sampleSemanticInput = {
  title: 'CLI test semantic',
  semantic_type: 'pattern' as const,
  knowledge: 'When error 907135702 occurs, check API parameters',
  source_type: 'manual' as const,
  source_episodic_ids: [] as string[],
  conditions: {
    applicable_context: ['api_error'],
    error_codes: ['907135702'],
  },
  category: 'api_usage',
  confidence: 0.9,
  tags: ['api', 'error'],
};

const sampleProceduralInput = {
  name: 'CLI auto-fix',
  description: 'Auto-fix for 907135702',
  procedural_type: 'skill' as const,
  trigger: {
    type: 'error_signal' as const,
    pattern: '907135702',
  },
  actions: [
    {
      type: 'suggest' as const,
      target: 'api_usage',
      params: { hint: 'Check parameters' },
    },
  ],
  source_semantic_ids: [] as string[],
  enabled: true,
  priority: 5,
};

describe('CLI search command', () => {
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

  it('calls search API and formats output by layer (semantic → episodic)', async () => {
    await client.createEpisodic(sampleEpisodicInput);
    await client.createSemantic(sampleSemanticInput);

    const result = await client.search('907135702');

    expect(result.procedural).toEqual([]);
    expect(result.semantic.length).toBeGreaterThanOrEqual(1);
    expect(result.episodic.length).toBeGreaterThanOrEqual(1);

    const semantic = result.semantic[0];
    expect(semantic.category).toBe('api_usage');
    expect(semantic.confidence).toBe(0.9);

    const episodic = result.episodic[0];
    expect(episodic.tags.severity).toBe('major');
    expect(episodic.title).toBe('CLI test error');
  });

  it('registers search command on Commander program', async () => {
    const createClient = () => new MemoPalaceClient(baseUrl);
    const program = new Command();
    registerSearch(program, createClient);

    const searchCmd = program.commands.find((c) => c.name() === 'search');
    expect(searchCmd).toBeDefined();
    expect(searchCmd!.description()).toContain('Search');
  });

  it('search command executes and outputs formatted results', async () => {
    await client.createEpisodic(sampleEpisodicInput);

    const createClient = () => new MemoPalaceClient(baseUrl);
    const program = new Command();
    program.exitOverride();
    registerSearch(program, createClient);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'memopalace', 'search', '907135702']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Episodic');
    expect(output).toContain('CLI test error');
    expect(output).toContain('major');

    logSpy.mockRestore();
  });

  it('search command with --layer flag filters results', async () => {
    await client.createEpisodic(sampleEpisodicInput);

    const createClient = () => new MemoPalaceClient(baseUrl);
    const program = new Command();
    program.exitOverride();
    registerSearch(program, createClient);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'memopalace', 'search', '907135702', '--layer', 'episodic']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Episodic');
    expect(output).not.toContain('Procedural');
    expect(output).not.toContain('Semantic');

    logSpy.mockRestore();
  });

  it('search command outputs "No results found" when empty', async () => {
    const createClient = () => new MemoPalaceClient(baseUrl);
    const program = new Command();
    program.exitOverride();
    registerSearch(program, createClient);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'memopalace', 'search', 'nonexistent_query_xyz']);

    expect(logSpy).toHaveBeenCalledWith('No results found.');

    logSpy.mockRestore();
  });
});
