import { describe, it, expect } from 'vitest';
import { createDb } from '../connection.js';
import { initSchema } from '../schema.js';

describe('initSchema', () => {
  it('creates all required tables', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('episodic_memory');
    expect(tableNames).toContain('semantic_memory');
    expect(tableNames).toContain('evolution_tasks');

    db.close();
  });

  it('creates FTS5 virtual tables', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('episodic_fts');
    expect(tableNames).toContain('semantic_fts');

    db.close();
  });

  it('creates required indexes', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];

    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_episodic_status');
    expect(indexNames).toContain('idx_episodic_group_key');
    expect(indexNames).toContain('idx_episodic_type');
    expect(indexNames).toContain('idx_semantic_category');
    expect(indexNames).toContain('idx_semantic_type');
    expect(indexNames).toContain('idx_evolution_status');

    db.close();
  });

  it('episodic_memory has expected columns', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const cols = db.pragma('table_info(episodic_memory)') as {
      name: string;
    }[];

    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('episodic_type');
    expect(colNames).toContain('source');
    expect(colNames).toContain('title');
    expect(colNames).toContain('status');
    expect(colNames).toContain('trigger_json');
    expect(colNames).toContain('resolution_json');
    expect(colNames).toContain('context_json');
    expect(colNames).toContain('tags_json');
    expect(colNames).toContain('consolidation_json');
    expect(colNames).toContain('group_key');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');

    db.close();
  });

  it('semantic_memory has expected columns', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const cols = db.pragma('table_info(semantic_memory)') as {
      name: string;
    }[];

    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('semantic_type');
    expect(colNames).toContain('title');
    expect(colNames).toContain('knowledge');
    expect(colNames).toContain('source_type');
    expect(colNames).toContain('source_episodic_ids_json');
    expect(colNames).toContain('conditions_json');
    expect(colNames).toContain('category');
    expect(colNames).toContain('confidence');
    expect(colNames).toContain('tags_json');
    expect(colNames).toContain('consolidation_json');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');

    db.close();
  });

  it('evolution_tasks has expected columns', () => {
    const db = createDb(':memory:');
    initSchema(db);

    const cols = db.pragma('table_info(evolution_tasks)') as {
      name: string;
    }[];

    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('type');
    expect(colNames).toContain('status');
    expect(colNames).toContain('source_ids_json');
    expect(colNames).toContain('result_id');
    expect(colNames).toContain('detail');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('resolved_at');

    db.close();
  });

  it('idempotent - calling initSchema twice does not error', () => {
    const db = createDb(':memory:');
    initSchema(db);
    expect(() => initSchema(db)).not.toThrow();
    db.close();
  });
});
