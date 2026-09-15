import { describe, expect, it } from 'vitest';

import type { Logger } from '@earthquake/observability';

import {
  InMemoryEventMessageQueue,
  InMemoryIngestionRunRepository,
  InMemoryRawObjectStore,
} from '../src/adapters/in-memory';
import { IngestionProducer } from '../src/application/ingestion-producer';
import { UsgsClient } from '../src/usgs/client';
import { makeUsgsCollection } from './fixtures/usgs';

const logger: Logger = { info: () => undefined, error: () => undefined };

describe('IngestionProducer', () => {
  it('stores a manifest and immutable event before publishing its message', async () => {
    const collection = makeUsgsCollection();
    const client = new UsgsClient(async () =>
      Promise.resolve(new Response(JSON.stringify(collection), { status: 200 })),
    );
    const rawStore = new InMemoryRawObjectStore();
    const queue = new InMemoryEventMessageQueue();
    const runs = new InMemoryIngestionRunRepository();
    const producer = new IngestionProducer(
      client,
      rawStore,
      queue,
      runs,
      { now: () => new Date('2026-09-14T13:11:00.000Z') },
      { generate: () => '00000000-0000-4000-8000-000000000001' },
      logger,
    );

    const result = await producer.poll();

    expect(result).toMatchObject({
      status: 'succeeded',
      counts: { fetched: 1, queued: 1, failed: 0 },
    });
    expect(rawStore.objects.size).toBe(2);
    expect(queue.messages).toHaveLength(1);
    expect(queue.messages[0]).toMatchObject({
      sourceEventId: 'us7000test',
      ingestionRunId: result.runId,
    });
    expect(runs.completed.get(result.runId)?.status).toBe('succeeded');
  });
});
