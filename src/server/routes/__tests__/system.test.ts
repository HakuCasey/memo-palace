import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { createDb } from '../../db/connection.js';
import { initSchema } from '../../db/schema.js';
import { systemRoutes } from '../system.js';

function buildApp() {
  const app = Fastify();
  const db = createDb(':memory:');
  initSchema(db);
  app.decorate('db', db);
  app.register(systemRoutes);
  return { app, db };
}

const sampleDebugCase = {
  dc_id: 'dc_hm_001',
  source: 'huawei_forum',
  title: '调用 @hms.core.push 获取 token 返回空',
  symptom: {
    error_signals: ['push_token_null', 'hms_core_error'],
    error_code: '907135702',
    error_message: 'PushService.getToken() returns null',
    observed_environment: ['HarmonyOS 4.0', 'Mate 60 Pro'],
    scenario: '应用启动时调用 push 服务获取 device token',
  },
  root_cause: {
    category: 'api_usage',
    analysis: 'HmsMessageService 需要在 Ability 的 onCreate 中初始化',
    related_api: '@hms.core.push.PushService',
    confidence: 0.95,
  },
  fix: {
    strategy: 'repair',
    description: '将 getToken 调用移到 HmsMessageService.onNewToken 回调中',
    key_code_snippet: 'onNewToken(token: string) { ... }',
    validation: 'getToken 返回非空字符串',
  },
  tags: {
    bug_type: ['null_return', 'async_timing'],
    severity: 'major',
    keywords: ['push token null', '907135702'],
  },
  evolver_meta: {
    promoted_to_gene: true,
    related_genes: ['gene_harmony_001'],
    ingested_at: '2026-05-22T10:00:00.000Z',
  },
};

describe('System routes', () => {
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

  describe('GET /api/status', () => {
    it('returns uptime, memory counts, and pending_tasks', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('uptime');
      expect(typeof body.uptime).toBe('number');
      expect(body).toHaveProperty('memory_counts');
      expect(body.memory_counts).toHaveProperty('episodic');
      expect(body.memory_counts).toHaveProperty('semantic');
      expect(body.memory_counts).toHaveProperty('procedural');
      expect(body).toHaveProperty('pending_tasks');
      expect(typeof body.pending_tasks).toBe('number');
    });

    it('reflects actual counts after inserting data', async () => {
      db.prepare(
        `INSERT INTO episodic_memory (id, episodic_type, source, title, status, trigger_json, context_json, tags_json, consolidation_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'ep_test_01',
        'debug_case',
        'manual',
        'Test',
        'open',
        JSON.stringify({ error_signals: [], error_message: 'err', scenario: 'test' }),
        JSON.stringify({ timestamp: new Date().toISOString() }),
        JSON.stringify({ keywords: [], severity: 'minor', bug_type: [] }),
        JSON.stringify({ promoted_to_semantic: false, related_semantic_ids: [] }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.memory_counts.episodic).toBe(1);
    });
  });

  describe('GET /api/self-check', () => {
    it('returns connectivity, memory stats, and DB health', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/self-check',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('connectivity');
      expect(body.connectivity).toBe('OK');
      expect(body).toHaveProperty('memory_stats');
      expect(body.memory_stats).toHaveProperty('episodic');
      expect(body.memory_stats).toHaveProperty('semantic');
      expect(body.memory_stats).toHaveProperty('procedural');
      expect(body).toHaveProperty('db_health');
      expect(body.db_health).toBe('OK');
    });
  });

  describe('POST /api/import', () => {
    it('imports DebugCase data and returns count', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [sampleDebugCase],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('imported');
      expect(body.imported).toBe(1);
    });

    it('creates episodic records from imported data', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [sampleDebugCase],
      });

      const rows = db.prepare('SELECT * FROM episodic_memory').all() as any[];
      expect(rows.length).toBe(1);

      const row = rows[0];
      expect(row.id).toMatch(/^ep_crawler_/);
      expect(row.source).toBe('crawler');
      expect(row.status).toBe('resolved');

      const trigger = JSON.parse(row.trigger_json);
      expect(trigger.error_code).toBe('907135702');
      expect(trigger.error_signals).toEqual(['push_token_null', 'hms_core_error']);

      const resolution = JSON.parse(row.resolution_json);
      expect(resolution.category).toBe('api_usage');
      expect(resolution.root_cause).toBe('HmsMessageService 需要在 Ability 的 onCreate 中初始化');
      expect(resolution.fix_strategy).toBe('repair');
      expect(resolution.fix_description).toBe('将 getToken 调用移到 HmsMessageService.onNewToken 回调中');

      const consolidation = JSON.parse(row.consolidation_json);
      expect(consolidation.promoted_to_semantic).toBe(true);
      expect(consolidation.related_semantic_ids).toEqual(['gene_harmony_001']);
    });

    it('computes group_key from error_code when present', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [sampleDebugCase],
      });

      const row = db.prepare('SELECT * FROM episodic_memory').get() as any;
      expect(row.group_key).toBe('907135702');
    });

    it('computes group_key from category+fix_strategy when no error_code', async () => {
      const noCodeCase = {
        ...sampleDebugCase,
        dc_id: 'dc_hm_002',
        symptom: {
          ...sampleDebugCase.symptom,
          error_code: '',
        },
      };

      await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [noCodeCase],
      });

      const row = db.prepare('SELECT * FROM episodic_memory').get() as any;
      expect(row.group_key).toBe('api_usage::repair');
    });

    it('maps source correctly for all types', async () => {
      const sources = [
        { dc_id: 'dc_hm_s1', source: 'huawei_forum', expected: 'crawler' },
        { dc_id: 'dc_gh_s2', source: 'github_issue', expected: 'crawler' },
        { dc_id: 'dc_git_s3', source: 'local_git', expected: 'crawler' },
        { dc_id: 'dc_hm_s4', source: 'manual', expected: 'manual' },
      ];

      for (const s of sources) {
        const testCase = {
          ...sampleDebugCase,
          dc_id: s.dc_id,
          source: s.source,
        };
        await app.inject({
          method: 'POST',
          url: '/api/import',
          payload: [testCase],
        });
      }

      const rows = db.prepare('SELECT source FROM episodic_memory').all() as any[];
      expect(rows.length).toBe(4);
      const sourceValues = rows.map(r => r.source).sort();
      expect(sourceValues).toEqual(['crawler', 'crawler', 'crawler', 'manual']);
    });

    it('imports multiple cases at once', async () => {
      const case2 = {
        ...sampleDebugCase,
        dc_id: 'dc_hm_002',
        title: 'Second case',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [sampleDebugCase, case2],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.imported).toBe(2);

      const rows = db.prepare('SELECT * FROM episodic_memory').all() as any[];
      expect(rows.length).toBe(2);
    });

    it('uses now as timestamp when ingested_at is missing', async () => {
      const noMeta = {
        ...sampleDebugCase,
        dc_id: 'dc_hm_nometa',
      };
      delete (noMeta as any).evolver_meta;

      await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [noMeta],
      });

      const row = db.prepare('SELECT * FROM episodic_memory').get() as any;
      const context = JSON.parse(row.context_json);
      expect(context.timestamp).toBeDefined();
    });

    it('defaults related_semantic_ids to empty array when missing', async () => {
      const noGenes = {
        ...sampleDebugCase,
        dc_id: 'dc_hm_nogenes',
        evolver_meta: {
          promoted_to_gene: false,
          ingested_at: '2026-05-22T10:00:00.000Z',
        },
      };

      await app.inject({
        method: 'POST',
        url: '/api/import',
        payload: [noGenes],
      });

      const row = db.prepare('SELECT * FROM episodic_memory').get() as any;
      const consolidation = JSON.parse(row.consolidation_json);
      expect(consolidation.related_semantic_ids).toEqual([]);
    });
  });
});
