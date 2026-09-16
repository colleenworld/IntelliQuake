import type { Pool, PoolClient } from 'pg';

import type { CandidateEdge, ClassifiableEvent } from '@earthquake/classification';
import type { EventSummary } from '@earthquake/domain';

import type {
  ClassificationCatalog,
  ClassificationRunRepository,
  ClassificationRunStart,
  PersistedCandidateSeries,
} from './ports';

interface SnapshotRow {
  id: string;
  origin_time: Date | string;
  latitude: number | string;
  longitude: number | string;
  depth_km: number | string;
  magnitude: number | string | null;
  place: string | null;
}

export class PostgresClassificationCatalog implements ClassificationCatalog {
  constructor(private readonly pool: Pool) {}

  async readSnapshot(input: {
    analysisStart: string;
    analysisEnd: string;
    catalogWatermark: string;
  }): Promise<ClassifiableEvent[]> {
    const result = await this.pool.query<SnapshotRow>(
      `WITH ranked_revisions AS (
         SELECT se.canonical_event_id AS id,
                er.origin_time,
                ST_Y(er.location::geometry) AS latitude,
                ST_X(er.location::geometry) AS longitude,
                er.depth_km,
                er.magnitude,
                er.place,
                row_number() OVER (
                  PARTITION BY se.canonical_event_id
                  ORDER BY er.source_updated_at DESC, er.payload_checksum DESC
                ) AS revision_rank
         FROM event_revisions er
         JOIN source_events se ON se.id = er.source_event_id
         WHERE er.observed_at <= $3::timestamptz
       )
       SELECT id, origin_time, latitude, longitude, depth_km, magnitude, place
       FROM ranked_revisions
       WHERE revision_rank = 1
         AND origin_time >= $1::timestamptz
         AND origin_time < $2::timestamptz
       ORDER BY origin_time, id`,
      [input.analysisStart, input.analysisEnd, input.catalogWatermark],
    );
    return result.rows.map((row) => ({
      id: row.id as EventSummary['id'],
      originTime: new Date(row.origin_time).toISOString(),
      coordinates: {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        depthKm: Number(row.depth_km),
      },
      magnitude: row.magnitude === null ? null : Number(row.magnitude),
      place: row.place,
    }));
  }
}

export class PostgresClassificationRunRepository implements ClassificationRunRepository {
  constructor(private readonly pool: Pool) {}

  async start(input: ClassificationRunStart): Promise<void> {
    await this.pool.query(
      `INSERT INTO classification_runs
        (id, algorithm, algorithm_version, parameters, catalog_watermark,
         analysis_start, analysis_end, status, started_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'running', $8)`,
      [
        input.id,
        input.algorithm,
        input.algorithmVersion,
        JSON.stringify(input.parameters),
        input.catalogWatermark,
        input.analysisStart,
        input.analysisEnd,
        input.startedAt,
      ],
    );
  }

  async complete(input: {
    id: string;
    completedAt: string;
    inputCount: number;
    edges: CandidateEdge[];
    series: PersistedCandidateSeries[];
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const edge of input.edges) await this.insertEdge(client, input.id, edge);
      for (const series of input.series) await this.insertSeries(client, input.id, series);
      await client.query(
        `UPDATE classification_runs
         SET status = 'succeeded', completed_at = $2, input_count = $3,
             series_count = $4, membership_count = $5
         WHERE id = $1 AND status = 'running'`,
        [
          input.id,
          input.completedAt,
          input.inputCount,
          input.series.length,
          input.series.reduce((count, series) => count + series.memberships.length, 0),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(input: { id: string; completedAt: string; errorSummary: string }): Promise<void> {
    await this.pool.query(
      `UPDATE classification_runs
       SET status = 'failed', completed_at = $2, failure_count = 1, error_summary = $3
       WHERE id = $1 AND status = 'running'`,
      [input.id, input.completedAt, input.errorSummary],
    );
  }

  private async insertEdge(client: PoolClient, runId: string, edge: CandidateEdge): Promise<void> {
    await client.query(
      `INSERT INTO series_edges
        (classification_run_id, source_event_id, target_event_id, time_delta_seconds,
         distance_km, magnitude_delta, score, rule, accepted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        runId,
        edge.sourceEventId,
        edge.targetEventId,
        edge.timeDeltaSeconds,
        edge.distanceKm,
        edge.magnitudeDelta,
        edge.score,
        edge.rule,
        edge.accepted,
      ],
    );
  }

  private async insertSeries(
    client: PoolClient,
    runId: string,
    series: PersistedCandidateSeries,
  ): Promise<void> {
    await client.query(
      `INSERT INTO seismic_series
        (id, classification_run_id, deterministic_key, mainshock_candidate_event_id,
         start_time, end_time, event_count, maximum_magnitude, centroid, display_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography, $11)`,
      [
        series.id,
        runId,
        series.key,
        series.mainshockCandidateEventId,
        series.startTime,
        series.endTime,
        series.eventCount,
        series.maximumMagnitude,
        series.centroid.longitude,
        series.centroid.latitude,
        series.displayName,
      ],
    );
    for (const membership of series.memberships) {
      await client.query(
        `INSERT INTO series_memberships
          (series_id, canonical_event_id, role, confidence, explanation)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          series.id,
          membership.eventId,
          membership.role,
          membership.confidence,
          JSON.stringify(membership.explanation),
        ],
      );
    }
  }
}
