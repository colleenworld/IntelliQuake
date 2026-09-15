import { randomUUID } from 'node:crypto';

import { type Pool, type PoolClient } from 'pg';

import type { RevisionOutcome } from '@earthquake/domain';

import type {
  EventRevisionRepository,
  IngestionRunInput,
  IngestionRunRepository,
  RevisionInput,
} from '../ports';

export class PostgresIngestionRunRepository implements IngestionRunRepository {
  constructor(private readonly pool: Pool) {}

  async start(input: IngestionRunInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO ingestion_runs
        (id, source, mode, status, requested_start, requested_end, started_at)
       VALUES ($1, $2, $3, 'running', $4, $5, $6)`,
      [
        input.id,
        input.source,
        input.mode,
        input.requestedStart ?? null,
        input.requestedEnd ?? null,
        input.startedAt,
      ],
    );
  }

  async complete(input: {
    id: string;
    status: 'succeeded' | 'partially_failed' | 'failed';
    sourceWatermark?: string;
    counts: { fetched: number; queued: number; failed: number };
    completedAt: string;
    errorSummary?: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE ingestion_runs
       SET status = $2,
           source_watermark = $3,
           fetched_count = $4,
           queued_count = $5,
           failed_count = $6,
           completed_at = $7,
           error_summary = $8
       WHERE id = $1`,
      [
        input.id,
        input.status,
        input.sourceWatermark ?? null,
        input.counts.fetched,
        input.counts.queued,
        input.counts.failed,
        input.completedAt,
        input.errorSummary ?? null,
      ],
    );
  }
}

export class PostgresEventRevisionRepository implements EventRevisionRepository {
  constructor(private readonly pool: Pool) {}

  async recordRevision(input: RevisionInput): Promise<RevisionOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${input.event.source}:${input.event.sourceEventId}`,
      ]);
      const rawObjectId = await this.upsertRawObject(client, input);
      const existingSource = await client.query<{
        id: string;
        canonical_event_id: string;
        current_source_updated_at: string | null;
        current_payload_checksum: string | null;
      }>(
        `SELECT se.id,
                se.canonical_event_id,
                current_revision.source_updated_at::text AS current_source_updated_at,
                current_revision.payload_checksum AS current_payload_checksum
         FROM source_events se
         JOIN canonical_events ce ON ce.id = se.canonical_event_id
         LEFT JOIN event_revisions current_revision ON current_revision.id = ce.current_source_revision_id
         WHERE se.source = $1 AND se.source_event_id = $2
         FOR UPDATE OF se`,
        [input.event.source, input.event.sourceEventId],
      );

      let outcome: RevisionOutcome;
      if (existingSource.rowCount === 0) {
        await this.createEvent(client, input, rawObjectId);
        outcome = 'created';
      } else {
        const source = existingSource.rows[0];
        if (!source) {
          throw new Error('PostgreSQL returned an empty source event row');
        }
        outcome = await this.updateEvent(client, source, input, rawObjectId);
      }

      await this.incrementRunCounts(client, input.ingestionRunId, outcome);
      await client.query('COMMIT');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertRawObject(client: PoolClient, input: RevisionInput): Promise<string> {
    const rawObjectId = randomUUID();
    const result = await client.query<{ id: string; checksum: string }>(
      `INSERT INTO raw_objects
        (id, storage_key, checksum, content_type, byte_length, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (storage_key) DO UPDATE SET storage_key = EXCLUDED.storage_key
       RETURNING id, checksum`,
      [
        rawObjectId,
        input.rawObject.key,
        input.rawObject.checksum,
        input.rawObject.contentType,
        input.rawObject.byteLength,
        input.rawObject.capturedAt,
      ],
    );
    const rawObject = result.rows[0];
    if (!rawObject || rawObject.checksum !== input.rawObject.checksum) {
      throw new Error(`Raw object integrity conflict for ${input.rawObject.key}`);
    }
    return rawObject.id;
  }

  private async createEvent(
    client: PoolClient,
    input: RevisionInput,
    rawObjectId: string,
  ): Promise<void> {
    const canonicalEventId = randomUUID();
    const sourceEventId = randomUUID();
    const revisionId = randomUUID();
    const values = this.scientificValues(input);

    await client.query(
      `INSERT INTO canonical_events
        (id, origin_time, location, depth_km, preferred_magnitude, preferred_magnitude_type,
         place, event_type, status, significance, felt_reports, tsunami,
         first_observed_at, last_observed_at)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14, $14)`,
      [canonicalEventId, ...values, input.observedAt],
    );
    await client.query(
      `INSERT INTO source_events
        (id, source, source_event_id, canonical_event_id, source_url,
         first_observed_at, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        sourceEventId,
        input.event.source,
        input.event.sourceEventId,
        canonicalEventId,
        input.event.sourceUrl,
        input.observedAt,
      ],
    );
    await this.insertRevision(client, revisionId, sourceEventId, rawObjectId, input);
    await client.query(
      'UPDATE canonical_events SET current_source_revision_id = $2 WHERE id = $1',
      [canonicalEventId, revisionId],
    );
  }

  private async updateEvent(
    client: PoolClient,
    source: {
      id: string;
      canonical_event_id: string;
      current_source_updated_at: string | null;
      current_payload_checksum: string | null;
    },
    input: RevisionInput,
    rawObjectId: string,
  ): Promise<RevisionOutcome> {
    const duplicate = await client.query(
      `SELECT 1 FROM event_revisions
       WHERE source_event_id = $1 AND source_updated_at = $2 AND payload_checksum = $3`,
      [source.id, input.event.sourceUpdatedAt, input.payloadChecksum],
    );
    if ((duplicate.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE source_events
         SET last_observed_at = GREATEST(last_observed_at, $2::timestamptz)
         WHERE id = $1`,
        [source.id, input.observedAt],
      );
      return 'unchanged';
    }

    const revisionId = randomUUID();
    await this.insertRevision(client, revisionId, source.id, rawObjectId, input);
    const currentUpdatedAt = source.current_source_updated_at
      ? new Date(source.current_source_updated_at).getTime()
      : undefined;
    const incomingUpdatedAt = new Date(input.event.sourceUpdatedAt).getTime();
    const isCurrent =
      currentUpdatedAt === undefined ||
      incomingUpdatedAt > currentUpdatedAt ||
      (incomingUpdatedAt === currentUpdatedAt &&
        input.payloadChecksum > (source.current_payload_checksum ?? ''));
    if (isCurrent) {
      const values = this.scientificValues(input);
      await client.query(
        `UPDATE canonical_events
         SET origin_time = $2,
             location = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
             depth_km = $5,
             preferred_magnitude = $6,
             preferred_magnitude_type = $7,
             place = $8,
             event_type = $9,
             status = $10,
             significance = $11,
             felt_reports = $12,
             tsunami = $13,
             current_source_revision_id = $14,
             last_observed_at = GREATEST(last_observed_at, $15::timestamptz),
             updated_at = now()
         WHERE id = $1`,
        [source.canonical_event_id, ...values, revisionId, input.observedAt],
      );
    } else {
      await client.query(
        `UPDATE canonical_events
         SET last_observed_at = GREATEST(last_observed_at, $2::timestamptz)
         WHERE id = $1`,
        [source.canonical_event_id, input.observedAt],
      );
    }
    await client.query(
      `UPDATE source_events
       SET source_url = CASE WHEN $4 THEN $2 ELSE source_url END,
           last_observed_at = GREATEST(last_observed_at, $3::timestamptz),
           updated_at = now()
       WHERE id = $1`,
      [source.id, input.event.sourceUrl, input.observedAt, isCurrent],
    );
    return 'revised';
  }

  private async incrementRunCounts(
    client: PoolClient,
    ingestionRunId: string,
    outcome: RevisionOutcome,
  ): Promise<void> {
    const column =
      outcome === 'created'
        ? 'created_count'
        : outcome === 'revised'
          ? 'revised_count'
          : 'unchanged_count';
    await client.query(
      `UPDATE ingestion_runs
       SET processed_count = processed_count + 1,
           ${column} = ${column} + 1,
           updated_at = now()
       WHERE id = $1`,
      [ingestionRunId],
    );
  }

  private async insertRevision(
    client: PoolClient,
    revisionId: string,
    sourceEventId: string,
    rawObjectId: string,
    input: RevisionInput,
  ): Promise<void> {
    const values = this.scientificValues(input);
    await client.query(
      `INSERT INTO event_revisions
        (id, source_event_id, ingestion_run_id, raw_object_id, source_updated_at,
         observed_at, payload_checksum, normalizer_version, origin_time, location,
         depth_km, magnitude, magnitude_type, place, event_type, status,
         significance, felt_reports, tsunami, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
               $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        revisionId,
        sourceEventId,
        input.ingestionRunId,
        rawObjectId,
        input.event.sourceUpdatedAt,
        input.observedAt,
        input.payloadChecksum,
        input.normalizerVersion,
        ...values,
        input.event.sourceUrl,
      ],
    );
  }

  private scientificValues(input: RevisionInput): readonly unknown[] {
    const event = input.event;
    return [
      event.originTime,
      event.coordinates.longitude,
      event.coordinates.latitude,
      event.coordinates.depthKm,
      event.magnitude,
      event.magnitudeType,
      event.place,
      event.eventType,
      event.status,
      event.significance,
      event.feltReports,
      event.tsunami,
    ];
  }
}
