import path from 'node:path';
import fs from 'node:fs';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const DIST_DIR = path.resolve(import.meta.dirname, '../../web/dist');

export const webRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _opts,
  done,
) => {
  app.get('/app/*', async (req, reply) => {
    const reqPath = (req.params as any)['*'] || '';
    let filePath = path.join(DIST_DIR, reqPath || 'index.html');

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      reply.code(404);
      return { error: 'Not found' };
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    reply.header('Content-Type', mime);
    return fs.readFileSync(filePath);
  });

  done();
};
