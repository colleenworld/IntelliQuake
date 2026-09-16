import { createLogger } from '@earthquake/observability';

import { systemClock, uuidGenerator } from '../adapters/system';
import { getDatabasePool } from '../database';
import { PostgresClassificationCatalog, PostgresClassificationRunRepository } from './postgres';
import { CandidateSeriesService } from './service';

export async function createCandidateSeriesService(): Promise<CandidateSeriesService> {
  const pool = await getDatabasePool();
  return new CandidateSeriesService(
    new PostgresClassificationCatalog(pool),
    new PostgresClassificationRunRepository(pool),
    systemClock,
    uuidGenerator,
    createLogger('candidate-series'),
  );
}
