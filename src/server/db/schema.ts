import Database from 'better-sqlite3';

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodic_memory (
      id TEXT PRIMARY KEY,
      episodic_type TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      trigger_json TEXT NOT NULL,
      resolution_json TEXT,
      context_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      consolidation_json TEXT NOT NULL DEFAULT '{"promoted_to_semantic":false,"related_semantic_ids":[]}',
      group_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      hit_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_episodic_hit ON episodic_memory(hit_count DESC);
    CREATE INDEX IF NOT EXISTS idx_episodic_status ON episodic_memory(status);
    CREATE INDEX IF NOT EXISTS idx_episodic_group_key ON episodic_memory(group_key);
    CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_memory(episodic_type);

    CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
      episodic_type,
      title,
      error_signals,
      error_code,
      error_message,
      scenario,
      root_cause,
      fix_description,
      keywords,
      content=episodic_memory,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS episodic_fts_ai AFTER INSERT ON episodic_memory BEGIN
      INSERT INTO episodic_fts(rowid, episodic_type, title, error_signals, error_code, error_message, scenario, root_cause, fix_description, keywords)
        VALUES (
          new.rowid,
          new.episodic_type,
          new.title,
          json_extract(new.trigger_json, '$.error_signals'),
          json_extract(new.trigger_json, '$.error_code'),
          json_extract(new.trigger_json, '$.error_message'),
          json_extract(new.trigger_json, '$.scenario'),
          json_extract(new.resolution_json, '$.root_cause'),
          json_extract(new.resolution_json, '$.fix_description'),
          json_extract(new.tags_json, '$.keywords')
        );
    END;

    CREATE TRIGGER IF NOT EXISTS episodic_fts_ad AFTER DELETE ON episodic_memory BEGIN
      INSERT INTO episodic_fts(episodic_fts, rowid, episodic_type, title, error_signals, error_code, error_message, scenario, root_cause, fix_description, keywords)
        VALUES ('delete', old.rowid, old.episodic_type, old.title, json_extract(old.trigger_json, '$.error_signals'), json_extract(old.trigger_json, '$.error_code'), json_extract(old.trigger_json, '$.error_message'), json_extract(old.trigger_json, '$.scenario'), json_extract(old.resolution_json, '$.root_cause'), json_extract(old.resolution_json, '$.fix_description'), json_extract(old.tags_json, '$.keywords'));
    END;

    CREATE TRIGGER IF NOT EXISTS episodic_fts_au AFTER UPDATE ON episodic_memory BEGIN
      INSERT INTO episodic_fts(episodic_fts, rowid, episodic_type, title, error_signals, error_code, error_message, scenario, root_cause, fix_description, keywords)
        VALUES ('delete', old.rowid, old.episodic_type, old.title, json_extract(old.trigger_json, '$.error_signals'), json_extract(old.trigger_json, '$.error_code'), json_extract(old.trigger_json, '$.error_message'), json_extract(old.trigger_json, '$.scenario'), json_extract(old.resolution_json, '$.root_cause'), json_extract(old.resolution_json, '$.fix_description'), json_extract(old.tags_json, '$.keywords'));
      INSERT INTO episodic_fts(rowid, episodic_type, title, error_signals, error_code, error_message, scenario, root_cause, fix_description, keywords)
        VALUES (
          new.rowid,
          new.episodic_type,
          new.title,
          json_extract(new.trigger_json, '$.error_signals'),
          json_extract(new.trigger_json, '$.error_code'),
          json_extract(new.trigger_json, '$.error_message'),
          json_extract(new.trigger_json, '$.scenario'),
          json_extract(new.resolution_json, '$.root_cause'),
          json_extract(new.resolution_json, '$.fix_description'),
          json_extract(new.tags_json, '$.keywords')
        );
    END;

    CREATE TABLE IF NOT EXISTS semantic_memory (
      id TEXT PRIMARY KEY,
      semantic_type TEXT NOT NULL,
      title TEXT NOT NULL,
      knowledge TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_episodic_ids_json TEXT NOT NULL DEFAULT '[]',
      conditions_json TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      consolidation_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      hit_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_hit ON semantic_memory(hit_count DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_category ON semantic_memory(category);
    CREATE INDEX IF NOT EXISTS idx_semantic_type ON semantic_memory(semantic_type);

    CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(
      semantic_type,
      title,
      knowledge,
      category,
      tags,
      content=semantic_memory,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS semantic_fts_ai AFTER INSERT ON semantic_memory BEGIN
      INSERT INTO semantic_fts(rowid, semantic_type, title, knowledge, category, tags)
        VALUES (
          new.rowid,
          new.semantic_type,
          new.title,
          new.knowledge,
          new.category,
          new.tags_json
        );
    END;

    CREATE TRIGGER IF NOT EXISTS semantic_fts_ad AFTER DELETE ON semantic_memory BEGIN
      INSERT INTO semantic_fts(semantic_fts, rowid, semantic_type, title, knowledge, category, tags)
        VALUES ('delete', old.rowid, old.semantic_type, old.title, old.knowledge, old.category, old.tags_json);
    END;

    CREATE TRIGGER IF NOT EXISTS semantic_fts_au AFTER UPDATE ON semantic_memory BEGIN
      INSERT INTO semantic_fts(semantic_fts, rowid, semantic_type, title, knowledge, category, tags)
        VALUES ('delete', old.rowid, old.semantic_type, old.title, old.knowledge, old.category, old.tags_json);
      INSERT INTO semantic_fts(rowid, semantic_type, title, knowledge, category, tags)
        VALUES (
          new.rowid,
          new.semantic_type,
          new.title,
          new.knowledge,
          new.category,
          new.tags_json
        );
    END;

    CREATE TABLE IF NOT EXISTS evolution_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      result_id TEXT,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_evolution_status ON evolution_tasks(status);

    CREATE TABLE IF NOT EXISTS pipeline_run (
      run_id          TEXT PRIMARY KEY,
      stage_id        TEXT NOT NULL,
      trigger         TEXT NOT NULL,
      status          TEXT NOT NULL,
      in_count        INTEGER NOT NULL DEFAULT 0,
      out_count       INTEGER NOT NULL DEFAULT 0,
      dropped_count   INTEGER NOT NULL DEFAULT 0,
      error_count     INTEGER NOT NULL DEFAULT 0,
      started_at      TEXT NOT NULL,
      finished_at     TEXT,
      duration_ms     INTEGER,
      error_message   TEXT,
      errors_json     TEXT,
      input_ids_json  TEXT,
      notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_run_stage ON pipeline_run(stage_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_run_started ON pipeline_run(started_at);

    CREATE TABLE IF NOT EXISTS pipeline_schedule (
      schedule_id     TEXT PRIMARY KEY,
      stage_id        TEXT NOT NULL UNIQUE,
      cron            TEXT NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      last_run_id     TEXT,
      last_run_at     TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS filter_rule (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      field      TEXT NOT NULL,
      operator   TEXT NOT NULL,
      value_json TEXT,
      enabled    INTEGER NOT NULL DEFAULT 1,
      priority   INTEGER NOT NULL DEFAULT 0,
      mode       TEXT NOT NULL DEFAULT 'include',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_filter_rule_priority ON filter_rule(priority);

    CREATE TABLE IF NOT EXISTS client_registry (
      client_id       TEXT PRIMARY KEY,
      client_type     TEXT NOT NULL,
      display_name    TEXT,
      first_seen_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      last_seen_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      metadata_json   TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_client_type ON client_registry(client_type);
    CREATE INDEX IF NOT EXISTS idx_client_last_seen ON client_registry(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_client_type_display ON client_registry(client_type, display_name);

    CREATE TABLE IF NOT EXISTS client_access_log (
      log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       TEXT NOT NULL,
      action_type     TEXT NOT NULL,
      query           TEXT,
      result_ids_json TEXT,
      result_count    INTEGER DEFAULT 0,
      accessed_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_access_client ON client_access_log(client_id);
    CREATE INDEX IF NOT EXISTS idx_access_time ON client_access_log(accessed_at);
    CREATE INDEX IF NOT EXISTS idx_access_query ON client_access_log(query);
  `);
}
