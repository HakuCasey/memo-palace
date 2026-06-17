import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EvolutionTask } from '../types.js';
import { localNow, localPast } from '../db/connection.js';

export interface AnalysisRule {
  name: string;
  scan(db: Database.Database): Omit<EvolutionTask, 'id' | 'created_at'>[];
}

export class SameCodeRule implements AnalysisRule {
  name = 'consolidate_same_code';

  scan(db: Database.Database): Omit<EvolutionTask, 'id' | 'created_at'>[] {
    const groups = db.prepare(
      "SELECT group_key, COUNT(*) as cnt FROM episodic_memory WHERE status = 'resolved' AND group_key IS NOT NULL AND group_key NOT LIKE '%::%' GROUP BY group_key HAVING COUNT(*) >= 3"
    ).all() as { group_key: string; cnt: number }[];

    const tasks: Omit<EvolutionTask, 'id' | 'created_at'>[] = [];

    for (const group of groups) {
      const rows = db.prepare(
        "SELECT id FROM episodic_memory WHERE status = 'resolved' AND group_key = ?"
      ).all(group.group_key) as { id: string }[];

      const sourceIds = rows.map((r) => r.id);
      const sourceIdsJson = JSON.stringify(sourceIds.sort());

      const existing = db.prepare(
        "SELECT id FROM evolution_tasks WHERE type = ? AND source_ids_json = ? AND status = 'pending'"
      ).get(this.name, sourceIdsJson);

      if (!existing) {
        tasks.push({
          type: this.name,
          status: 'pending',
          source_ids: sourceIds,
          detail: 'Consolidate ' + sourceIds.length + ' episodic memories with error_code ' + group.group_key,
        });
      }
    }

    return tasks;
  }
}

export class SameCategoryRule implements AnalysisRule {
  name = 'consolidate_same_category';

  scan(db: Database.Database): Omit<EvolutionTask, 'id' | 'created_at'>[] {
    const groups = db.prepare(
      "SELECT group_key, COUNT(*) as cnt FROM episodic_memory WHERE status = 'resolved' AND group_key IS NOT NULL AND group_key LIKE '%::%' GROUP BY group_key HAVING COUNT(*) >= 3"
    ).all() as { group_key: string; cnt: number }[];

    const tasks: Omit<EvolutionTask, 'id' | 'created_at'>[] = [];

    for (const group of groups) {
      const rows = db.prepare(
        "SELECT id FROM episodic_memory WHERE status = 'resolved' AND group_key = ?"
      ).all(group.group_key) as { id: string }[];

      const sourceIds = rows.map((r) => r.id);
      const sourceIdsJson = JSON.stringify(sourceIds.sort());

      const existing = db.prepare(
        "SELECT id FROM evolution_tasks WHERE type = ? AND source_ids_json = ? AND status = 'pending'"
      ).get(this.name, sourceIdsJson);

      if (!existing) {
        tasks.push({
          type: this.name,
          status: 'pending',
          source_ids: sourceIds,
          detail: 'Consolidate ' + sourceIds.length + ' episodic memories with category pattern ' + group.group_key,
        });
      }
    }

    return tasks;
  }
}

export class OrphanCleanupRule implements AnalysisRule {
  name = 'archive_orphan';

  scan(db: Database.Database): Omit<EvolutionTask, 'id' | 'created_at'>[] {
    const orphans = db.prepare(
      "SELECT id FROM episodic_memory WHERE status = 'open' AND created_at < ?"
    ).all(localPast(30)) as { id: string }[];

    const tasks: Omit<EvolutionTask, 'id' | 'created_at'>[] = [];

    for (const orphan of orphans) {
      const sourceIds = [orphan.id];
      const sourceIdsJson = JSON.stringify(sourceIds);

      const existing = db.prepare(
        "SELECT id FROM evolution_tasks WHERE type = ? AND source_ids_json = ? AND status = 'pending'"
      ).get(this.name, sourceIdsJson);

      if (!existing) {
        tasks.push({
          type: this.name,
          status: 'pending',
          source_ids: sourceIds,
          detail: 'Archive orphan episodic memory ' + orphan.id,
        });
      }
    }

    return tasks;
  }
}

function generateTaskId(type: string, sourceIds: string[]): string {
  const content = type + ':' + sourceIds.sort().join(',');
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return 'et_' + type + '_' + hash;
}

export class Analyzer {
  private rules: AnalysisRule[] = [];

  constructor() {
    this.rules.push(new SameCodeRule());
    this.rules.push(new SameCategoryRule());
    this.rules.push(new OrphanCleanupRule());
  }

  addRule(rule: AnalysisRule): void {
    this.rules.push(rule);
  }

  scan(db: Database.Database): number {
    let newTaskCount = 0;

    for (const rule of this.rules) {
      const taskParts = rule.scan(db);

      for (const part of taskParts) {
        const id = generateTaskId(part.type, part.source_ids);
        const existing = db.prepare('SELECT id FROM evolution_tasks WHERE id = ?').get(id);
        if (existing) continue;

        db.prepare(
          'INSERT INTO evolution_tasks (id, type, status, source_ids_json, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, part.type, part.status, JSON.stringify(part.source_ids.sort()), part.detail, localNow());

        newTaskCount++;
      }
    }

    return newTaskCount;
  }
}
