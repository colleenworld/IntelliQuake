import { describe, expect, it } from 'vitest';

import type { RawEventMessage } from '@earthquake/contracts';
import type { Logger } from '@earthquake/observability';

import { InMemoryEventRevisionRepository, InMemoryRawObjectStore } from '../src/adapters/in-memory';
import { EventProcessor, RawObjectIntegrityError } from '../src/application/event-processor';
import { sha256, stableJson } from '../src/checksum';
import type { UsgsFeature } from '../src/usgs/schema';
import { makeUsgsFeature } from './fixtures/usgs';

const logger: Logger = { info: () => undefined, error: () => undefined };
const runId = '00000000-0000-4000-8000-000000000001';

async function storeMessage(
  rawStore: InMemoryRawObjectStore,
  feature: UsgsFeature,
): Promise<RawEventMessage> {
  const body = stableJson(feature);
  const checksum = sha256(body);
  const capturedAt = '2026-09-14T13:11:00.000Z';
  const key = `test/${feature.id}/${feature.properties.updated}-${checksum}.geojson`;
  await rawStore.put({ key, body, checksum, capturedAt });
  return {
    schemaVersion: 1,
    messageType: 'raw-event-available',
    ingestionRunId: runId,
    ingestionMode: 'replay',
    source: 'usgs',
    sourceEventId: feature.id,
    sourceUpdatedAt: new Date(feature.properties.updated).toISOString(),
    rawObjectKey: key,
    rawObjectChecksum: checksum,
    capturedAt,
  };
}

describe('EventProcessor', () => {
  it('creates, deduplicates, and revises a source event', async () => {
    const rawStore = new InMemoryRawObjectStore();
    const revisions = new InMemoryEventRevisionRepository();
    const processor = new EventProcessor(
      rawStore,
      revisions,
      { now: () => new Date('2026-09-14T13:12:00.000Z') },
      logger,
    );
    const original = makeUsgsFeature();
    const originalMessage = await storeMessage(rawStore, original);

    await expect(processor.process(originalMessage)).resolves.toBe('created');
    await expect(processor.process(originalMessage)).resolves.toBe('unchanged');

    const revised = makeUsgsFeature({
      mag: 4.4,
      updated: Date.parse('2026-09-14T13:15:00.000Z'),
    });
    await expect(processor.process(await storeMessage(rawStore, revised))).resolves.toBe('revised');

    expect(revisions.revisions).toHaveLength(2);
    expect(revisions.current.get('usgs:us7000test')?.event.magnitude).toBe(4.4);
  });

  it('does not let an out-of-order revision replace the current projection', async () => {
    const rawStore = new InMemoryRawObjectStore();
    const revisions = new InMemoryEventRevisionRepository();
    const processor = new EventProcessor(
      rawStore,
      revisions,
      { now: () => new Date('2026-09-14T13:20:00.000Z') },
      logger,
    );
    const latest = makeUsgsFeature({
      mag: 4.8,
      updated: Date.parse('2026-09-14T13:18:00.000Z'),
    });
    const older = makeUsgsFeature({
      mag: 4.1,
      updated: Date.parse('2026-09-14T13:12:00.000Z'),
    });

    await processor.process(await storeMessage(rawStore, latest));
    await processor.process(await storeMessage(rawStore, older));

    expect(revisions.revisions).toHaveLength(2);
    expect(revisions.current.get('usgs:us7000test')?.event.magnitude).toBe(4.8);
  });

  it('resolves equal source timestamps deterministically regardless of delivery order', async () => {
    const first = makeUsgsFeature({ mag: 4.3 });
    const second = makeUsgsFeature({ mag: 4.6 });

    const processInOrder = async (features: UsgsFeature[]) => {
      const rawStore = new InMemoryRawObjectStore();
      const revisions = new InMemoryEventRevisionRepository();
      const processor = new EventProcessor(
        rawStore,
        revisions,
        { now: () => new Date('2026-09-14T13:20:00.000Z') },
        logger,
      );
      for (const feature of features) {
        await processor.process(await storeMessage(rawStore, feature));
      }
      return revisions.current.get('usgs:us7000test');
    };

    const forward = await processInOrder([first, second]);
    const reverse = await processInOrder([second, first]);

    expect(forward?.payloadChecksum).toBe(reverse?.payloadChecksum);
    expect(forward?.event.magnitude).toBe(reverse?.event.magnitude);
  });

  it('rejects corrupted raw data before normalization', async () => {
    const rawStore = new InMemoryRawObjectStore();
    const revisions = new InMemoryEventRevisionRepository();
    const processor = new EventProcessor(
      rawStore,
      revisions,
      { now: () => new Date('2026-09-14T13:20:00.000Z') },
      logger,
    );
    const message = await storeMessage(rawStore, makeUsgsFeature());
    const object = rawStore.objects.get(message.rawObjectKey);
    if (!object) throw new Error('Test fixture was not stored');
    object.body = `${object.body} `;

    await expect(processor.process(message)).rejects.toBeInstanceOf(RawObjectIntegrityError);
    expect(revisions.revisions).toHaveLength(0);
  });
});
