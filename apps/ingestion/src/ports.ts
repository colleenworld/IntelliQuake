import type { IngestionMode, RawEventMessage } from '@earthquake/contracts';
import type { NormalizedEvent, RevisionOutcome } from '@earthquake/domain';

export interface StoredRawObject {
  key: string;
  checksum: string;
  byteLength: number;
  contentType: 'application/geo+json';
  capturedAt: string;
}

export interface RawObjectStore {
  put(input: {
    key: string;
    body: string;
    checksum: string;
    capturedAt: string;
  }): Promise<StoredRawObject>;
  get(key: string): Promise<string>;
}

export interface EventMessageQueue {
  send(message: RawEventMessage): Promise<void>;
}

export interface IngestionRunInput {
  id: string;
  source: 'usgs';
  mode: IngestionMode;
  requestedStart?: string;
  requestedEnd?: string;
  startedAt: string;
}

export interface IngestionRunCounts {
  fetched: number;
  queued: number;
  failed: number;
}

export interface IngestionRunRepository {
  start(input: IngestionRunInput): Promise<void>;
  complete(input: {
    id: string;
    status: 'succeeded' | 'partially_failed' | 'failed';
    sourceWatermark?: string;
    counts: IngestionRunCounts;
    completedAt: string;
    errorSummary?: string;
  }): Promise<void>;
}

export interface RevisionInput {
  event: NormalizedEvent;
  rawObject: StoredRawObject;
  payloadChecksum: string;
  normalizerVersion: string;
  ingestionRunId: string;
  observedAt: string;
}

export interface EventRevisionRepository {
  recordRevision(input: RevisionInput): Promise<RevisionOutcome>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}
