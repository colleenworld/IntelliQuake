import { createLogger } from '@earthquake/observability';

import {
  PostgresEventRevisionRepository,
  PostgresIngestionRunRepository,
} from './adapters/postgres-repositories';
import { S3RawObjectStore } from './adapters/s3-raw-object-store';
import { SqsEventMessageQueue } from './adapters/sqs-event-message-queue';
import { systemClock, uuidGenerator } from './adapters/system';
import { EventProcessor } from './application/event-processor';
import { IngestionProducer } from './application/ingestion-producer';
import { getDatabasePool } from './database';
import { UsgsClient } from './usgs/client';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function createAwsProducer(): Promise<IngestionProducer> {
  const pool = await getDatabasePool();
  return new IngestionProducer(
    new UsgsClient(fetch, process.env.USGS_FEED_URL, process.env.USGS_QUERY_URL),
    new S3RawObjectStore(requiredEnvironment('RAW_BUCKET')),
    new SqsEventMessageQueue(requiredEnvironment('INGESTION_QUEUE_URL')),
    new PostgresIngestionRunRepository(pool),
    systemClock,
    uuidGenerator,
    createLogger('ingestion-producer'),
  );
}

export async function createAwsProcessor(): Promise<EventProcessor> {
  const pool = await getDatabasePool();
  return new EventProcessor(
    new S3RawObjectStore(requiredEnvironment('RAW_BUCKET')),
    new PostgresEventRevisionRepository(pool),
    systemClock,
    createLogger('event-processor'),
  );
}
