import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;
let pool: pg.Pool | null = null;

export function initializeDatabase(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl, max: 10 });
    pool.on('error', (err) => console.error('[pg] idle client error', err));
  }
  return pool;
}

export function getPool(): pg.Pool {
  return pool ?? initializeDatabase();
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[] | undefined);
}

/** Run all .sql files in ./migrations in order. Migrations are idempotent. */
export async function runMigrations(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith('.sql') && !f.startsWith('.'))
    .sort();
  console.log(`Running ${files.length} migration(s)...`);
  for (const f of files) {
    const sql = await fs.readFile(path.join(dir, f), 'utf-8');
    await query(sql);
    console.log(`  migration ${f} ✓`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
