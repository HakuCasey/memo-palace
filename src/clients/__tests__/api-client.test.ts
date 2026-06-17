import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../../server/db/connection.js';
import { initSchema } from '../../server/db/schema.js';
import { episodicRoutes } from '../../server/routes/episodic.js';
import { semanticRoutes } from '../../server/routes/semantic.js';
import { proceduralRoutes } from '../../server/routes/procedural.js';
import { searchRoutes } from '../../server/routes/search.js';
import { evolutionRoutes } from '../../server/routes/evolution.js';
import { systemRoutes } from '../../server/routes/system.js';
import { MemoPalaceClient } from '../api-client.js';
import type BetterSqlite3 from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  title: 'Client test error',
  trigger: {
    error_signals: ['stack_trace'],
    error_code: '907135702',
    error_message: 'Client test error message',
    scenario: 'api client test',
  },
  tags: {
    keywords: ['test'],
    severity: 'major' as const,
    bug_type: ['logic'],
  },
};

const sampleSemanticInput = {
  title: 'Test semantic knowledge',
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
  name: 'Auto-fix API parameter error',
  description: 'Automatically suggest parameter fix for 907135702',
  procedural_type: 'skill' as const,
  trigger: {
    type: 'error_signal' as const,
    pattern: '907135702',
  },
  actions: [
    {
      type: 'suggest' as const,
      target: 'api_usage',
      params: { hint: 'Check API parameters' },
    },
  ],
  source_semantic_ids: [] as string[],
  enabled: true,
  priority: 5,
};

describe('MemoPalaceClient', () => {
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
    baseUrl = address.replace('http://', 'http://');
    client = new MemoPalaceClient(baseUrl);
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  describe('createEpisodic', () => {
    it('POST /api/episodic creates and returns episodic memory', async () => {
      const result = await client.createEpisodic(sampleEpisodicInput);
      expect(result.id).toMatch(/^ep_manual_/);
      expect(result.status).toBe('open');
      expect(result.title).toBe('Client test error');
      expect(result.trigger.error_code).toBe('907135702');
      expect(result.tags.severity).toBe('major');
    });
  });

  describe('updateEpisodic', () => {
    it('PATCH /api/episodic/:id updates and returns episodic memory', async () => {
      const created = await client.createEpisodic(sampleEpisodicInput);
      const updated = await client.updateEpisodic(created.id, {
        status: 'resolved',
        resolution: {
          category: 'api_usage',
          root_cause: 'bad param',
          fix_strategy: 'repair',
          fix_description: 'Fixed the param',
        },
      });
      expect(updated.status).toBe('resolved');
      expect(updated.resolution?.category).toBe('api_usage');
    });
  });

  describe('listEpisodic', () => {
    it('GET /api/episodic returns array with filters', async () => {
      await client.createEpisodic(sampleEpisodicInput);
      const list = await client.listEpisodic({ status: 'open' });
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(1);
      expect(list[0].status).toBe('open');
    });
  });

  describe('getEpisodic', () => {
    it('GET /api/episodic/:id returns single record', async () => {
      const created = await client.createEpisodic(sampleEpisodicInput);
      const fetched = await client.getEpisodic(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.title).toBe('Client test error');
    });
  });

  describe('createSemantic', () => {
    it('POST /api/semantic creates and returns semantic memory', async () => {
      const result = await client.createSemantic(sampleSemanticInput);
      expect(result.id).toMatch(/^sm_api_usage_/);
      expect(result.knowledge).toBe('When error 907135702 occurs, check API parameters');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('updateSemantic', () => {
    it('PATCH /api/semantic/:id updates and returns semantic memory', async () => {
      const created = await client.createSemantic(sampleSemanticInput);
      const updated = await client.updateSemantic(created.id, { confidence: 0.95 });
      expect(updated.confidence).toBe(0.95);
    });
  });

  describe('listSemantic', () => {
    it('GET /api/semantic returns array', async () => {
      await client.createSemantic(sampleSemanticInput);
      const list = await client.listSemantic({ category: 'api_usage' });
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(1);
    });
  });

  describe('getSemantic', () => {
    it('GET /api/semantic/:id returns single record', async () => {
      const created = await client.createSemantic(sampleSemanticInput);
      const fetched = await client.getSemantic(created.id);
      expect(fetched.id).toBe(created.id);
    });
  });

  describe('createProcedural', () => {
    it('POST /api/procedural creates and returns procedural memory', async () => {
      const result = await client.createProcedural(sampleProceduralInput);
      expect(result.id).toMatch(/^pm_skill_/);
      expect(result.name).toBe('Auto-fix API parameter error');
      expect(result.enabled).toBe(true);
      expect(result.priority).toBe(5);
    });
  });

  describe('updateProcedural', () => {
    it('PATCH /api/procedural/:id updates and returns procedural memory', async () => {
      const created = await client.createProcedural(sampleProceduralInput);
      const updated = await client.updateProcedural(created.id, { enabled: false, priority: 10 });
      expect(updated.enabled).toBe(false);
      expect(updated.priority).toBe(10);
    });
  });

  describe('listProcedural', () => {
    it('GET /api/procedural returns array', async () => {
      const created = await client.createProcedural(sampleProceduralInput);
      const list = await client.listProcedural();
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((p) => p.id === created.id)).toBe(true);
    });
  });

  describe('getProcedural', () => {
    it('GET /api/procedural/:id returns single record', async () => {
      const created = await client.createProcedural(sampleProceduralInput);
      const fetched = await client.getProcedural(created.id);
      expect(fetched.id).toBe(created.id);
    });
  });

  describe('search', () => {
    it('POST /api/search returns search results', async () => {
      await client.createEpisodic(sampleEpisodicInput);
      const results = await client.search('907135702');
      expect(results.episodic).toBeDefined();
      expect(results.semantic).toBeDefined();
      expect(results.procedural).toBeDefined();
      expect(results.episodic.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStatus', () => {
    it('GET /api/status returns server status', async () => {
      await client.createEpisodic(sampleEpisodicInput);
      const status = await client.getStatus();
      expect(status.uptime).toBeDefined();
      expect(typeof status.uptime).toBe('number');
      expect(status.memory_counts.episodic).toBe(1);
      expect(status.memory_counts.semantic).toBe(0);
      expect(status.memory_counts.procedural).toBe(0);
    });
  });

  describe('selfCheck', () => {
    it('GET /api/self-check returns health info', async () => {
      const result = await client.selfCheck();
      expect(result.connectivity).toBe('OK');
      expect(result.db_health).toBe('OK');
      expect(result.memory_stats).toBeDefined();
    });
  });

  describe('importData', () => {
    it('POST /api/import imports debug cases', async () => {
      const cases = [
        {
          dc_id: 'dc_hm_test_001',
          source: 'huawei_forum',
          title: 'Imported error case',
          symptom: {
            error_signals: ['crash_log'],
            error_code: 'ERR_IMPORT',
            error_message: 'Import test error',
            scenario: 'import test',
          },
          root_cause: {
            category: 'import_cat',
            analysis: 'import root cause',
          },
          fix: {
            strategy: 'restart',
            description: 'Restart the service',
          },
          tags: {
            keywords: ['import'],
            severity: 'minor',
            bug_type: ['config'],
          },
        },
      ];
      const result = await client.importData(cases);
      expect(result.imported).toBe(1);
    });
  });

  describe('analyze', () => {
    it('POST /api/evolution/analyze runs analysis', async () => {
      const result = await client.analyze();
      expect(result.new_tasks).toBeDefined();
      expect(typeof result.new_tasks).toBe('number');
    });
  });

  describe('listEvolutionTasks', () => {
    it('GET /api/evolution/tasks returns pending tasks', async () => {
      const tasks = await client.listEvolutionTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('confirmTask', () => {
    it('POST /api/evolution/tasks/:id/confirm confirms a task', async () => {
      const db2 = db;
      const insertStmt = db2.prepare(`
        INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, resolution_json, context_json, tags_json, consolidation_json, group_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 1; i <= 3; i++) {
        insertStmt.run(
          `ep_conf_${i}`,
          'debug_case',
          'manual',
          `Confirm test ${i}`,
          'resolved',
          JSON.stringify({ error_signals: ['stack_trace'], error_code: 'CONFIRM_TEST', error_message: 'test', scenario: 'test' }),
          JSON.stringify({ category: 'api_usage', root_cause: 'bad', fix_strategy: 'repair', fix_description: 'fix' }),
          JSON.stringify({ timestamp: new Date().toISOString() }),
          JSON.stringify({ keywords: [], severity: 'minor', bug_type: [] }),
          JSON.stringify({ promoted_to_semantic: false, related_semantic_ids: [] }),
          'CONFIRM_TEST',
        );
      }

      await client.analyze();
      const tasks = await client.listEvolutionTasks();
      const task = tasks.find((t) => t.type === 'consolidate_same_code');
      expect(task).toBeDefined();

      const confirmed = await client.confirmTask(task!.id);
      expect(confirmed.status).toBe('executed');
      expect(confirmed.result_id).toBeDefined();
    });
  });

  describe('rejectTask', () => {
    it('POST /api/evolution/tasks/:id/reject rejects a task', async () => {
      const db2 = db;
      const insertStmt = db2.prepare(`
        INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, resolution_json, context_json, tags_json, consolidation_json, group_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 1; i <= 3; i++) {
        insertStmt.run(
          `ep_reject_${i}`,
          'debug_case',
          'manual',
          `Reject test ${i}`,
          'resolved',
          JSON.stringify({ error_signals: ['stack_trace'], error_code: 'REJECT_TEST', error_message: 'test', scenario: 'test' }),
          JSON.stringify({ category: 'api_usage', root_cause: 'bad', fix_strategy: 'repair', fix_description: 'fix' }),
          JSON.stringify({ timestamp: new Date().toISOString() }),
          JSON.stringify({ keywords: [], severity: 'minor', bug_type: [] }),
          JSON.stringify({ promoted_to_semantic: false, related_semantic_ids: [] }),
          'REJECT_TEST',
        );
      }

      await client.analyze();
      const tasks = await client.listEvolutionTasks();
      const task = tasks.find((t) => t.type === 'consolidate_same_code');
      expect(task).toBeDefined();

      const rejected = await client.rejectTask(task!.id);
      expect(rejected.status).toBe('rejected');
    });
  });

  describe('getEvolutionHistory', () => {
    it('GET /api/evolution/history returns completed/rejected tasks', async () => {
      const history = await client.getEvolutionHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('throws on 404 for getEpisodic with non-existent id', async () => {
      await expect(client.getEpisodic('ep_manual_nonexistent')).rejects.toThrow('Not found');
    });

    it('throws on 404 for getSemantic with non-existent id', async () => {
      await expect(client.getSemantic('sm_nonexistent')).rejects.toThrow('Not found');
    });

    it('throws on 404 for getProcedural with non-existent id', async () => {
      await expect(client.getProcedural('pm_nonexistent')).rejects.toThrow('Not found');
    });
  });
});
