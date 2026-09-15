import type { IngestionMode, RawEventMessage } from '@earthquake/contracts';
import type { Logger } from '@earthquake/observability';

import { sha256, stableJson } from '../checksum';
import type {
  Clock,
  EventMessageQueue,
  IdGenerator,
  IngestionRunCounts,
  IngestionRunRepository,
  RawObjectStore,
} from '../ports';
import type { UsgsResponse } from '../usgs/client';
import type { UsgsClient } from '../usgs/client';
import type { UsgsFeature } from '../usgs/schema';

export interface BackfillRequest {
  startTime: Date;
  endTime: Date;
  minimumMagnitude?: number;
  partitionDays?: number;
}

export interface IngestionResult {
  runId: string;
  status: 'succeeded' | 'partially_failed';
  counts: IngestionRunCounts;
  sourceWatermark?: string;
}

export class IngestionProducer {
  constructor(
    private readonly client: UsgsClient,
    private readonly rawStore: RawObjectStore,
    private readonly queue: EventMessageQueue,
    private readonly runs: IngestionRunRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  async poll(): Promise<IngestionResult> {
    return this.execute('poll', undefined, async (consume) =>
      consume(await this.client.fetchFeed()),
    );
  }

  async backfill(request: BackfillRequest): Promise<IngestionResult> {
    return this.execute(
      'backfill',
      {
        requestedStart: request.startTime.toISOString(),
        requestedEnd: request.endTime.toISOString(),
      },
      async (consume) => {
        for await (const response of this.client.backfill(request)) {
          await consume(response);
        }
      },
    );
  }

  private async execute(
    mode: IngestionMode,
    requested: { requestedStart: string; requestedEnd: string } | undefined,
    retrieve: (consume: (response: UsgsResponse) => Promise<void>) => Promise<void>,
  ): Promise<IngestionResult> {
    const runId = this.ids.generate();
    const startedAt = this.clock.now().toISOString();
    const counts: IngestionRunCounts = { fetched: 0, queued: 0, failed: 0 };
    let sourceWatermark: string | undefined;

    await this.runs.start({
      id: runId,
      source: 'usgs',
      mode,
      ...requested,
      startedAt,
    });

    try {
      await retrieve(async (response) => {
        const responseWatermark = new Date(response.data.metadata.generated).toISOString();
        sourceWatermark =
          sourceWatermark === undefined || responseWatermark > sourceWatermark
            ? responseWatermark
            : sourceWatermark;
        await this.persistManifest(runId, mode, response, responseWatermark);

        for (const feature of response.data.features) {
          counts.fetched += 1;
          try {
            await this.persistAndQueueFeature(runId, mode, feature);
            counts.queued += 1;
          } catch (error) {
            counts.failed += 1;
            this.logger.error('Failed to persist or queue USGS event', {
              runId,
              sourceEventId: feature.id,
              error: error instanceof Error ? error.message : 'unknown error',
            });
          }
        }
      });
    } catch (error) {
      await this.runs.complete({
        id: runId,
        status: 'failed',
        sourceWatermark,
        counts,
        completedAt: this.clock.now().toISOString(),
        errorSummary: error instanceof Error ? error.message : 'unknown ingestion failure',
      });
      throw error;
    }

    const status = counts.failed === 0 ? 'succeeded' : 'partially_failed';
    await this.runs.complete({
      id: runId,
      status,
      sourceWatermark,
      counts,
      completedAt: this.clock.now().toISOString(),
    });
    this.logger.info('USGS ingestion run completed', {
      runId,
      mode,
      status,
      fetched: counts.fetched,
      queued: counts.queued,
      failed: counts.failed,
    });

    return { runId, status, counts, sourceWatermark };
  }

  private async persistManifest(
    runId: string,
    mode: IngestionMode,
    response: UsgsResponse,
    watermark: string,
  ): Promise<void> {
    const capturedAt = this.clock.now().toISOString();
    const checksum = sha256(response.rawText);
    const key = `usgs/manifests/${mode}/${runId}/${watermark.replaceAll(':', '-')}-${checksum}.geojson`;
    await this.rawStore.put({ key, body: response.rawText, checksum, capturedAt });
  }

  private async persistAndQueueFeature(
    runId: string,
    mode: IngestionMode,
    feature: UsgsFeature,
  ): Promise<void> {
    const body = stableJson(feature);
    const checksum = sha256(body);
    const capturedAt = this.clock.now().toISOString();
    const sourceUpdatedAt = new Date(feature.properties.updated).toISOString();
    const eventDate = new Date(feature.properties.time)
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '/');
    const sourceEventId = encodeURIComponent(feature.id);
    const key = `usgs/events/${eventDate}/${sourceEventId}/${feature.properties.updated}-${checksum}.geojson`;

    await this.rawStore.put({ key, body, checksum, capturedAt });
    const message: RawEventMessage = {
      schemaVersion: 1,
      messageType: 'raw-event-available',
      ingestionRunId: runId,
      ingestionMode: mode,
      source: 'usgs',
      sourceEventId: feature.id,
      sourceUpdatedAt,
      rawObjectKey: key,
      rawObjectChecksum: checksum,
      capturedAt,
    };
    await this.queue.send(message);
  }
}
