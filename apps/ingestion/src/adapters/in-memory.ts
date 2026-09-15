import type { RawEventMessage } from '@earthquake/contracts';
import type { RevisionOutcome } from '@earthquake/domain';

import type {
  EventMessageQueue,
  EventRevisionRepository,
  IngestionRunInput,
  IngestionRunRepository,
  RawObjectStore,
  RevisionInput,
  StoredRawObject,
} from '../ports';

export class InMemoryRawObjectStore implements RawObjectStore {
  readonly objects = new Map<string, { body: string; metadata: StoredRawObject }>();

  async put(input: {
    key: string;
    body: string;
    checksum: string;
    capturedAt: string;
  }): Promise<StoredRawObject> {
    const existing = this.objects.get(input.key);
    if (existing && existing.metadata.checksum !== input.checksum) {
      throw new Error(`Attempted to overwrite immutable raw object ${input.key}`);
    }
    const metadata: StoredRawObject = {
      key: input.key,
      checksum: input.checksum,
      byteLength: Buffer.byteLength(input.body, 'utf8'),
      contentType: 'application/geo+json',
      capturedAt: input.capturedAt,
    };
    this.objects.set(input.key, { body: input.body, metadata });
    return metadata;
  }

  async get(key: string): Promise<string> {
    const object = this.objects.get(key);
    if (!object) {
      throw new Error(`Raw object not found: ${key}`);
    }
    return object.body;
  }
}

export class InMemoryEventMessageQueue implements EventMessageQueue {
  readonly messages: RawEventMessage[] = [];

  async send(message: RawEventMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

interface CompletedRun {
  status: 'succeeded' | 'partially_failed' | 'failed';
  sourceWatermark?: string;
  counts: { fetched: number; queued: number; failed: number };
  completedAt: string;
  errorSummary?: string;
}

export class InMemoryIngestionRunRepository implements IngestionRunRepository {
  readonly started = new Map<string, IngestionRunInput>();
  readonly completed = new Map<string, CompletedRun>();

  async start(input: IngestionRunInput): Promise<void> {
    this.started.set(input.id, structuredClone(input));
  }

  async complete(input: CompletedRun & { id: string }): Promise<void> {
    const { id, ...completed } = input;
    this.completed.set(id, structuredClone(completed));
  }
}

export class InMemoryEventRevisionRepository implements EventRevisionRepository {
  readonly revisions: RevisionInput[] = [];
  readonly current = new Map<string, RevisionInput>();

  async recordRevision(input: RevisionInput): Promise<RevisionOutcome> {
    const identity = `${input.event.source}:${input.event.sourceEventId}`;
    const duplicate = this.revisions.some(
      (revision) =>
        `${revision.event.source}:${revision.event.sourceEventId}` === identity &&
        revision.event.sourceUpdatedAt === input.event.sourceUpdatedAt &&
        revision.payloadChecksum === input.payloadChecksum,
    );
    if (duplicate) {
      return 'unchanged';
    }

    const outcome: RevisionOutcome = this.current.has(identity) ? 'revised' : 'created';
    const copy = structuredClone(input);
    this.revisions.push(copy);
    const current = this.current.get(identity);
    if (
      !current ||
      copy.event.sourceUpdatedAt > current.event.sourceUpdatedAt ||
      (copy.event.sourceUpdatedAt === current.event.sourceUpdatedAt &&
        copy.payloadChecksum > current.payloadChecksum)
    ) {
      this.current.set(identity, copy);
    }
    return outcome;
  }
}
