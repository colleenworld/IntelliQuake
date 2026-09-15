import { Pool } from 'pg';

export const DATABASE = Symbol('DATABASE');

export interface Queryable {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{
    rows: T[];
    rowCount: number | null;
  }>;
}

export function createDatabasePool(): Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://earthquake:earthquake@localhost:5432/earthquake',
    max: 5,
  });
}
