import Fastify from 'fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from './db/connection.js';
import { initSchema } from './db/schema.js';
import { episodicRoutes } from './routes/episodic.js';
import { semanticRoutes } from './routes/semantic.js';
import { proceduralRoutes } from './routes/procedural.js';
import { searchRoutes } from './routes/search.js';
import { memoryRoutes } from './routes/memory.js';
import { evolutionRoutes } from './routes/evolution.js';
import { systemRoutes } from './routes/system.js';
import { webRoutes } from './web/index.js';
import { bootstrapPipeline, defaultPaths } from './services/pipeline/bootstrap.js';
import { pipelineRoutes } from './routes/pipeline.js';
import { scheduleRoutes } from './routes/schedule.js';
import { analyzerRoutes } from './routes/analyzer.js';
import { ensureClient } from './services/client-registry.js';

async function main() {
  const dbPath = process.env.MEMOPALACE_DB || 'memopalace.db';
  const port = parseInt(process.env.PORT || '5678', 10);

  const db = createDb(dbPath);
  initSchema(db);

  const app = Fastify();

  app.addHook('onRequest', (_req, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    done();
  });

  app.addHook('onRequest', (req, _reply, done) => {
    if (req.method === 'OPTIONS') {
      _reply.code(204).send();
      return;
    }
    done();
  });

  app.addHook('onRequest', (req, reply, done) => {
    if (req.method === 'OPTIONS') {
      done();
      return;
    }
    const clientId = req.headers['x-client-id'] as string | undefined;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const newId = ensureClient(db, clientId, userAgent);
    reply.header('X-Client-ID', newId);
    done();
  });

  app.decorate('db', db);

  app.register(episodicRoutes);
  app.register(semanticRoutes);
  app.register(proceduralRoutes);
  app.register(searchRoutes);
  app.register(memoryRoutes);
  app.register(evolutionRoutes);
  app.register(systemRoutes);
  app.register(webRoutes);

  // RFC-002 pipeline: bootstrap stages + load cron schedules, then register routes
  const __dirname = (import.meta as { dirname?: string }).dirname ?? dirname(fileURLToPath(import.meta.url));
  const paths = defaultPaths(join(__dirname, '..'));
  bootstrapPipeline(db, paths);

  const pipelineDirs: Record<string, string> = {
    normalizer: paths.normalizerDir,
    filter:     paths.filterDir,
    evolved:    paths.evolvedDir,
  };

  app.register(async (instance) => {
    await pipelineRoutes(instance, db, pipelineDirs, paths.sourcesRoot);
    await scheduleRoutes(instance, db);
    await analyzerRoutes(instance, db, paths);
  });

  app.get('/', async () => ({ name: 'MemoPalace', version: '0.1.0', status: 'running' }));

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await app.close();
    closeDb(db);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`MemoPalace server listening on port ${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    closeDb(db);
    process.exit(1);
  }
}

main();
