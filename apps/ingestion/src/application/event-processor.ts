import { RawEventMessageSchema, type RawEventMessage } from '@earthquake/contracts';
import type { RevisionOutcome } from '@earthquake/domain';
import type { Logger } from '@earthquake/observability';

import { sha256 } from '../checksum';
import type { Clock, EventRevisionRepository, RawObjectStore } from '../ports';
import { NORMALIZER_VERSION, normalizeUsgsFeature } from '../usgs/normalizer';

export class RawObjectIntegrityError extends Error {
  constructor(readonly key: string) {
    super(`Raw object checksum does not match message metadata: ${key}`);
    this.name = 'RawObjectIntegrityError';
  }
}

export class RawEventIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RawEventIdentityError';
  }
}

export class EventProcessor {
  constructor(
    private readonly rawStore: RawObjectStore,
    private readonly revisions: EventRevisionRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async process(input: RawEventMessage | unknown): Promise<RevisionOutcome> {
    const message = RawEventMessageSchema.parse(input);
    const body = await this.rawStore.get(message.rawObjectKey);
    if (sha256(body) !== message.rawObjectChecksum) {
      throw new RawObjectIntegrityError(message.rawObjectKey);
    }

    const event = normalizeUsgsFeature(JSON.parse(body) as unknown);
    if (event.sourceEventId !== message.sourceEventId) {
      throw new RawEventIdentityError('Raw event ID does not match its queue message');
    }
    if (event.sourceUpdatedAt !== message.sourceUpdatedAt) {
      throw new RawEventIdentityError(
        'Raw event update timestamp does not match its queue message',
      );
    }

    const outcome = await this.revisions.recordRevision({
      event,
      rawObject: {
        key: message.rawObjectKey,
        checksum: message.rawObjectChecksum,
        byteLength: Buffer.byteLength(body, 'utf8'),
        contentType: 'application/geo+json',
        capturedAt: message.capturedAt,
      },
      payloadChecksum: message.rawObjectChecksum,
      normalizerVersion: NORMALIZER_VERSION,
      ingestionRunId: message.ingestionRunId,
      observedAt: this.clock.now().toISOString(),
    });
    this.logger.info('USGS event processed', {
      ingestionRunId: message.ingestionRunId,
      sourceEventId: message.sourceEventId,
      outcome,
    });
    return outcome;
  }
}
