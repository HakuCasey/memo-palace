import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { localNow } from '../db/connection.js';

export function detectClientType(userAgent?: string): string {
  if (!userAgent) return 'unknown';
  if (userAgent.includes('memopalace-cli')) return 'cli';
  if (userAgent.includes('memopalace-mcp')) return 'mcp';
  if (userAgent.includes('Mozilla/')) return 'web';
  return 'unknown';
}

export function generateClientId(type: string): string {
  const hash = crypto.createHash('sha256').update(`${type}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8);
  return `${type}_${hash}`;
}

let cachedDb: Database.Database | null = null;
let stmts: {
  findClient: ReturnType<Database.Database['prepare']>;
  findByTypeAndDisplay: ReturnType<Database.Database['prepare']>;
  updateLastSeen: ReturnType<Database.Database['prepare']>;
  insertClient: ReturnType<Database.Database['prepare']>;
} | null = null;

function getStatements(db: Database.Database) {
  if (cachedDb !== db || !stmts) {
    cachedDb = db;
    stmts = {
      findClient: db.prepare('SELECT client_id FROM client_registry WHERE client_id = ?'),
      findByTypeAndDisplay: db.prepare('SELECT client_id FROM client_registry WHERE client_type = ? AND display_name = ? LIMIT 1'),
      updateLastSeen: db.prepare('UPDATE client_registry SET last_seen_at = ? WHERE client_id = ?'),
      insertClient: db.prepare(`
        INSERT INTO client_registry (client_id, client_type, display_name, metadata_json, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
    };
  }
  return stmts;
}

export function ensureClient(
  db: Database.Database,
  clientId: string | undefined,
  userAgent: string | undefined,
): string {
  try {
    const type = detectClientType(userAgent);
    const { findClient, findByTypeAndDisplay, updateLastSeen, insertClient } = getStatements(db);

    if (clientId) {
      const existing = findClient.get(clientId) as { client_id: string } | undefined;
      if (existing) {
        (updateLastSeen as any).run(localNow(), clientId);
        return clientId;
      }
    }

    const displayName = userAgent ? userAgent.slice(0, 200) : `${type} client`;

    const existingByUA = (findByTypeAndDisplay as any).get(type, displayName) as { client_id: string } | undefined;
    if (existingByUA) {
      (updateLastSeen as any).run(localNow(), existingByUA.client_id);
      return existingByUA.client_id;
    }

    const newId = generateClientId(type);
    const now = localNow();
    (insertClient as any).run(newId, type, displayName, JSON.stringify({ userAgent: userAgent?.slice(0, 200) }), now, now);

    return newId;
  } catch {
    // Graceful fallback: return a temporary ID without DB write
    return `unknown_${Date.now()}`;
  }
}
