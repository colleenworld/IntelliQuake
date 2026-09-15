import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

import { getDatabasePool } from '../database';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<{
  PhysicalResourceId: string;
}> {
  if (event.RequestType !== 'Delete') {
    const sql = await readFile(path.join(__dirname, '001_ingestion_schema.sql'), 'utf8');
    const pool = await getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', ['earthquake-schema-migrations']);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        'earthquake-schema-migrations',
      ]);
      client.release();
    }
  }

  return { PhysicalResourceId: 'earthquake-ingestion-schema-v1' };
}
