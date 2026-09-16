import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';
import { z } from 'zod';

const DatabaseSecretSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive().default(5432),
  username: z.string().min(1),
  password: z.string(),
  dbname: z.string().min(1),
});

let poolPromise: Promise<Pool> | undefined;

export function getDatabasePool(): Promise<Pool> {
  poolPromise ??= createDatabasePool();
  return poolPromise;
}

export async function closeDatabasePool(): Promise<void> {
  const current = poolPromise;
  poolPromise = undefined;
  if (current) await (await current).end();
}

async function createDatabasePool(): Promise<Pool> {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const secretArn = process.env.DATABASE_SECRET_ARN;
    if (!secretArn) {
      throw new Error('DATABASE_URL or DATABASE_SECRET_ARN is required');
    }
    const response = await new SecretsManagerClient({}).send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!response.SecretString) {
      throw new Error('Database secret does not contain a string value');
    }
    const secret = DatabaseSecretSchema.parse(JSON.parse(response.SecretString) as unknown);
    connectionString = `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port}/${encodeURIComponent(secret.dbname)}`;
  }

  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 2),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
}
