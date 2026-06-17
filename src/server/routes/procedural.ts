import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type {
  CreateProceduralInput,
  ProceduralMemory,
  UpdateProceduralInput,
} from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROCEDURAL_DIR = path.resolve(__dirname, '../../memory/procedural');

interface ProceduralRouteOpts {
  proceduralDir?: string;
}

interface ProceduralBody extends CreateProceduralInput {
  procedural_type: 'skill' | 'workflow';
}

interface UpdateProceduralBody extends UpdateProceduralInput {
  procedural_type?: 'skill' | 'workflow';
}

function generateId(proceduralType: string, name: string): string {
  const content = `${name}:${Date.now()}:${Math.random()}`;
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `pm_${proceduralType}_${hash}`;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readProceduralFile(filePath: string): ProceduralMemory {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export const proceduralRoutes: FastifyPluginCallback<ProceduralRouteOpts> = (
  app: FastifyInstance,
  opts,
  done,
) => {
  const baseDir = opts.proceduralDir || DEFAULT_PROCEDURAL_DIR;

  function findFile(id: string): string | null {
    for (const sub of ['skill', 'workflow'] as const) {
      const filePath = path.join(baseDir, sub, `${id}.json`);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  }
  app.post<{ Body: ProceduralBody }>(
    '/api/procedural',
    async (req, reply) => {
      const input = req.body;
      const proceduralType = input.procedural_type;
      const id = generateId(proceduralType, input.name);

      const sourceSemanticIds = input.source_semantic_ids ?? [];
      const enabled = input.enabled ?? true;
      const priority = input.priority ?? 0;

      const record: ProceduralMemory = {
        id,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        actions: input.actions,
        source_semantic_ids: sourceSemanticIds,
        enabled,
        priority,
        stats: {
          triggered_count: 0,
          success_count: 0,
        },
      };

      const dir = path.join(baseDir, proceduralType);
      ensureDir(dir);
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2));

      reply.code(201);
      return record;
    },
  );

  app.get<{ Querystring: { procedural_type?: string; page?: string; limit?: string } }>(
    '/api/procedural',
    async (req) => {
      const { procedural_type, page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 20);
      const offset = (pageNum - 1) * limitNum;

      const types: ('skill' | 'workflow')[] = procedural_type
        ? [procedural_type as 'skill' | 'workflow']
        : ['skill', 'workflow'];

      const all: ProceduralMemory[] = [];
      for (const t of types) {
        const dir = path.join(baseDir, t);
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        for (const f of files) {
          all.push(readProceduralFile(path.join(dir, f)));
        }
      }

      return all.slice(offset, offset + limitNum);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/procedural/:id',
    async (req, reply) => {
      const filePath = findFile(req.params.id);
      if (!filePath) {
        reply.code(404);
        return { error: 'Not found' };
      }
      return readProceduralFile(filePath);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateProceduralBody }>(
    '/api/procedural/:id',
    async (req, reply) => {
      const { id } = req.params;
      const input = req.body;
      const filePath = findFile(id);
      if (!filePath) {
        reply.code(404);
        return { error: 'Not found' };
      }

      const existing = readProceduralFile(filePath);
      const updated: ProceduralMemory = {
        ...existing,
        ...Object.fromEntries(
          Object.entries({
            name: input.name,
            description: input.description,
            actions: input.actions,
            enabled: input.enabled,
            priority: input.priority,
          }).filter(([, v]) => v !== undefined)
        ),
        trigger: input.trigger
          ? { ...existing.trigger, ...input.trigger }
          : existing.trigger,
        stats: input.stats
          ? { ...existing.stats, ...input.stats }
          : existing.stats,
      };

      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/procedural/:id',
    async (req, reply) => {
      const filePath = findFile(req.params.id);
      if (!filePath) {
        reply.code(404);
        return { error: 'Not found' };
      }

      fs.unlinkSync(filePath);
      reply.code(204);
    },
  );

  done();
};
