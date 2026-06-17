import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { Analyzer } from '../services/analyzer.js';
import { Evolver } from '../services/evolver.js';
import type { EvolutionTask } from '../types.js';
import { localNow } from '../db/connection.js';

interface TaskDbRow {
  id: string;
  type: string;
  status: string;
  source_ids_json: string;
  result_id: string | null;
  detail: string;
  created_at: string;
  resolved_at: string | null;
}

function parseTaskRow(row: TaskDbRow): EvolutionTask {
  return {
    id: row.id,
    type: row.type,
    status: row.status as EvolutionTask['status'],
    source_ids: JSON.parse(row.source_ids_json),
    result_id: row.result_id ?? undefined,
    detail: row.detail,
    created_at: row.created_at,
    resolved_at: row.resolved_at ?? undefined,
  };
}

export const evolutionRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.post('/api/evolution/analyze', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const analyzer = new Analyzer();
    const newTasks = analyzer.scan(db);
    return { new_tasks: newTasks };
  });

  app.get('/api/evolution/tasks', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const rows = db.prepare("SELECT * FROM evolution_tasks WHERE status = 'pending' ORDER BY created_at DESC").all() as TaskDbRow[];
    return rows.map(parseTaskRow);
  });

  app.post<{ Params: { id: string } }>('/api/evolution/tasks/:id/confirm', async (req, reply) => {
    const db = app.db as import('better-sqlite3').Database;
    const { id } = req.params;

    const task = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(id) as TaskDbRow | undefined;
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    if (task.status !== 'pending') {
      reply.code(400);
      return { error: 'Task is not pending' };
    }

    db.prepare("UPDATE evolution_tasks SET status = 'confirmed', resolved_at = ? WHERE id = ?").run(localNow(), id);

    const evolver = new Evolver();

    if (task.type === 'consolidate_same_code' || task.type === 'consolidate_same_category') {
      evolver.consolidate(db, id);
    } else if (task.type === 'archive_orphan') {
      evolver.archive(db, id);
    }

    const updatedTask = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(id) as TaskDbRow;
    return parseTaskRow(updatedTask);
  });

  app.post<{ Params: { id: string } }>('/api/evolution/tasks/:id/reject', async (req, reply) => {
    const db = app.db as import('better-sqlite3').Database;
    const { id } = req.params;

    const task = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(id) as TaskDbRow | undefined;
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    db.prepare("UPDATE evolution_tasks SET status = 'rejected', resolved_at = ? WHERE id = ?").run(localNow(), id);

    const updatedTask = db.prepare('SELECT * FROM evolution_tasks WHERE id = ?').get(id) as TaskDbRow;
    return parseTaskRow(updatedTask);
  });

  app.get('/api/evolution/history', async () => {
    const db = app.db as import('better-sqlite3').Database;
    const rows = db.prepare("SELECT * FROM evolution_tasks WHERE status IN ('executed', 'rejected') ORDER BY resolved_at DESC").all() as TaskDbRow[];
    return rows.map(parseTaskRow);
  });

  done();
};
