import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

import { getDatabasePool } from '../database';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<{
  PhysicalResourceId: string;
}> {
  if (event.RequestType !== 'Delete') {
    const pool = await getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', ['earthquake-schema-migrations']);
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           filename text PRIMARY KEY,
           applied_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      for (const filename of ['001_ingestion_schema.sql', '002_candidate_series.sql']) {
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
          filename,
        ]);
        if ((applied.rowCount ?? 0) > 0) continue;
        const sql = await readFile(path.join(__dirname, filename), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        'earthquake-schema-migrations',
      ]);
      client.release();
    }
  }

  return { PhysicalResourceId: 'earthquake-platform-schema-v2' };
}
