import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const directory =
    process.env.DB_MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../database/migrations');
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['earthquake-schema-migrations']);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const files = (await readdir(directory)).filter((filename) => filename.endsWith('.sql')).sort();

    for (const filename of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
        filename,
      ]);
      if ((applied.rowCount ?? 0) > 0) {
        continue;
      }
      const sql = await readFile(path.join(directory, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.info(`Applied ${filename}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['earthquake-schema-migrations']);
    client.release();
    await pool.end();
  }
}

void migrate();
