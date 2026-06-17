import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { listSchedules, upsertSchedule, removeSchedule } from "../services/pipeline/scheduler.js";

export async function scheduleRoutes(app: FastifyInstance, db: Database.Database): Promise<void> {
  app.get("/api/schedule", async () => listSchedules(db));

  app.post("/api/schedule", async (req, reply) => {
    const body = req.body as { stage_id: string; cron: string; enabled: boolean };
    try {
      const row = upsertSchedule(db, body);
      return row;
    } catch (e) {
      reply.code(400);
      return { error: String((e as Error).message) };
    }
  });

  app.delete("/api/schedule/:schedule_id", async (req) => {
    const { schedule_id } = req.params as { schedule_id: string };
    removeSchedule(db, schedule_id);
    return { removed: true };
  });
}
