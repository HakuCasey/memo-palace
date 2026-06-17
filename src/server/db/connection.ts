import Database from 'better-sqlite3';

export function localNow(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function localPast(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createDb(path: string = 'memopalace.db'): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const table of ['episodic_memory', 'semantic_memory']) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${table.replace('_memory', '')}_hit ON ${table}(hit_count DESC);`);
    } catch {
      // Column already exists — ignore
    }
  }

  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
