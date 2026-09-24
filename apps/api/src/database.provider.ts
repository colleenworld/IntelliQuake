import { Pool, type PoolConfig } from 'pg';

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

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function connectionConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT ?? 5432),
      user: requiredEnvironmentVariable('PGUSER'),
      password: requiredEnvironmentVariable('PGPASSWORD'),
      database: requiredEnvironmentVariable('PGDATABASE'),
    };
  }

  return {
    connectionString: 'postgresql://earthquake:earthquake@localhost:5432/earthquake',
  };
}

export function createDatabasePool(): Pool {
  return new Pool({
    ...connectionConfig(),
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
}
