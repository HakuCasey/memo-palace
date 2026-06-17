import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { localNow } from '../db/connection.js';

interface EpisodicRow {
  id: string;
  episodic_type: string;
  source: string;
  title: string;
  status: string;
  trigger_json: string;
  resolution_json: string | null;
  context_json: string;
  tags_json: string;
  consolidation_json: string;
  group_key: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  type: string;
  status: string;
  source_ids_json: string;
  result_id: string | null;
  detail: string;
  created_at: string;
  resolved_at: string | null;
}

export class Evolver {
  consolidate(db: Database.Database, taskId: string): string | null {
    const task = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!task) return null;

    const sourceIds = JSON.parse(task.source_ids_json) as string[];
    const rows = db.prepare(
      'SELECT * FROM episodic_memory WHERE id IN (' + sourceIds.map(() => '?').join(',') + ')'
    ).all(...sourceIds) as EpisodicRow[];

    if (rows.length === 0) return null;

    const categories = new Set<string>();
    const errorCodes = new Set<string>();
    const rootCauses: string[] = [];
    const fixDescriptions: string[] = [];

    for (const row of rows) {
      const trigger = JSON.parse(row.trigger_json);
      if (trigger.error_code) errorCodes.add(trigger.error_code);

      if (row.resolution_json) {
        const resolution = JSON.parse(row.resolution_json);
        if (resolution.category) categories.add(resolution.category);
        if (resolution.root_cause) rootCauses.push(resolution.root_cause);
        if (resolution.fix_description) fixDescriptions.push(resolution.fix_description);
      }
    }

    const category = [...categories][0] ?? 'unknown';
    const now = new Date().toISOString();

    const semanticId = 'sm_' + category + '_' + crypto.createHash('sha256').update(task.id + ':' + Date.now()).digest('hex').slice(0, 8);

    const title = 'Consolidated pattern: ' + category;
    const knowledge = 'Pattern identified across ' + rows.length + ' episodes. Root causes: ' + rootCauses.join('; ') + '. Fixes: ' + fixDescriptions.join('; ');

    const conditions = {
      applicable_context: [...categories],
      error_codes: [...errorCodes],
    };

    const consolidation = {
      created_at: now,
      match_count: 0,
    };

    db.prepare(
      'INSERT INTO semantic_memory (id, semantic_type, title, knowledge, source_type, source_episodic_ids_json, conditions_json, category, confidence, tags_json, consolidation_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      semanticId,
      'pattern',
      title,
      knowledge,
      'consolidated',
      JSON.stringify(sourceIds),
      JSON.stringify(conditions),
      category,
      1.0,
      JSON.stringify([]),
      JSON.stringify(consolidation),
      localNow(),
      localNow(),
    );

    for (const row of rows) {
      const consolidationData = JSON.parse(row.consolidation_json);
      const relatedIds = consolidationData.related_semantic_ids ?? [];
      if (!relatedIds.includes(semanticId)) {
        relatedIds.push(semanticId);
      }

      db.prepare(
        "UPDATE episodic_memory SET consolidation_json = ?, updated_at = ? WHERE id = ?"
      ).run(
        JSON.stringify({
          ...consolidationData,
          promoted_to_semantic: true,
          related_semantic_ids: relatedIds,
        }),
        localNow(),
        row.id,
      );
    }

    db.prepare(
      "UPDATE evolution_tasks SET status = ?, result_id = ?, resolved_at = ? WHERE id = ?"
    ).run('executed', semanticId, localNow(), taskId);

    return semanticId;
  }

  archive(db: Database.Database, taskId: string): void {
    const task = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!task) return;

    const sourceIds = JSON.parse(task.source_ids_json) as string[];

    for (const id of sourceIds) {
      db.prepare("UPDATE episodic_memory SET status = 'archived', updated_at = ? WHERE id = ?").run(localNow(), id);
    }

    db.prepare(
      "UPDATE evolution_tasks SET status = 'executed', resolved_at = ? WHERE id = ?"
    ).run(localNow(), taskId);
  }

  internalize(_db: Database.Database, _taskId: string): void {
    throw new Error('Not implemented: internalize is for manual creation of procedural from semantic');
  }
}
