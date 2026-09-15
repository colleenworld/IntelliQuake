import path from 'node:path';

import { createLogger } from '@earthquake/observability';
import { Pool } from 'pg';

import { DirectEventMessageQueue } from '../adapters/direct-event-message-queue';
import { LocalRawObjectStore } from '../adapters/local-raw-object-store';
import {
  PostgresEventRevisionRepository,
  PostgresIngestionRunRepository,
} from '../adapters/postgres-repositories';
import { systemClock, uuidGenerator } from '../adapters/system';
import { EventProcessor } from '../application/event-processor';
import { IngestionProducer } from '../application/ingestion-producer';
import { UsgsClient } from '../usgs/client';

export function createLocalProducer(): { producer: IngestionProducer; pool: Pool } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: databaseUrl });
  const projectRoot = path.resolve(process.cwd(), '../..');
  const configuredRawDirectory = process.env.RAW_OBJECT_DIRECTORY;
  const rawStore = new LocalRawObjectStore(
    configuredRawDirectory
      ? path.resolve(projectRoot, configuredRawDirectory)
      : path.resolve(projectRoot, '.local/raw'),
  );
  const logger = createLogger('local-ingestion');
  const processor = new EventProcessor(
    rawStore,
    new PostgresEventRevisionRepository(pool),
    systemClock,
    logger,
  );
  const queue = new DirectEventMessageQueue((message) => processor.process(message));
  const producer = new IngestionProducer(
    new UsgsClient(fetch, process.env.USGS_FEED_URL, process.env.USGS_QUERY_URL),
    rawStore,
    queue,
    new PostgresIngestionRunRepository(pool),
    systemClock,
    uuidGenerator,
    logger,
  );
  return { producer, pool };
}
