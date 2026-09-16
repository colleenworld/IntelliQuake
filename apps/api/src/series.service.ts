import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  ClassificationRunResponseSchema,
  SeriesDetailResponseSchema,
  SeriesSearchQuerySchema,
  SeriesSearchResponseSchema,
  type ClassificationRunResponse,
  type SeriesDetailResponse,
  type SeriesSearchResponse,
} from '@earthquake/contracts';
import { z } from 'zod';

import { DATABASE, type Queryable } from './database.provider';

interface RunRow extends Record<string, unknown> {
  id: string;
  algorithm: string;
  algorithm_version: string;
  parameters: Record<string, number>;
  catalog_watermark: Date | string;
  analysis_start: Date | string;
  analysis_end: Date | string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: Date | string;
  completed_at: Date | string | null;
  input_count: number | string;
  series_count: number | string;
  membership_count: number | string;
  failure_count: number | string;
  error_summary: string | null;
}

interface SeriesRow extends Record<string, unknown> {
  id: string;
  classification_run_id: string;
  mainshock_candidate_event_id: string;
  start_time: Date | string;
  end_time: Date | string;
  event_count: number | string;
  maximum_magnitude: number | string | null;
  latitude: number | string;
  longitude: number | string;
  display_name: string;
}

interface SeriesWithRunRow extends SeriesRow, RunRow {
  run_id: string;
}

interface MembershipRow extends Record<string, unknown> {
  id: string;
  origin_time: Date | string;
  latitude: number | string;
  longitude: number | string;
  depth_km: number | string;
  magnitude: number | string | null;
  magnitude_type: string | null;
  place: string | null;
  source: string;
  source_event_id: string;
  role: 'earlier_event' | 'mainshock_candidate' | 'later_event';
  confidence: number | string;
  explanation: Record<string, unknown>;
}

interface EdgeRow extends Record<string, unknown> {
  source_event_id: string;
  target_event_id: string;
  time_delta_seconds: number | string;
  distance_km: number | string;
  magnitude_delta: number | string | null;
  score: number | string;
  rule: string;
  accepted: boolean;
}

interface SeriesCursor {
  startTime: string;
  id: string;
}

const SeriesCursorSchema = z.object({
  startTime: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

const iso = (value: Date | string): string => new Date(value).toISOString();

function toRun(row: RunRow) {
  return {
    id: row.id,
    algorithm: row.algorithm,
    algorithmVersion: row.algorithm_version,
    parameters: row.parameters,
    catalogWatermark: iso(row.catalog_watermark),
    analysisStart: iso(row.analysis_start),
    analysisEnd: iso(row.analysis_end),
    status: row.status,
    startedAt: iso(row.started_at),
    completedAt: row.completed_at === null ? null : iso(row.completed_at),
    inputCount: Number(row.input_count),
    seriesCount: Number(row.series_count),
    membershipCount: Number(row.membership_count),
    failureCount: Number(row.failure_count),
    errorSummary: row.error_summary,
  };
}

function toSeries(row: SeriesRow) {
  return {
    id: row.id,
    classificationRunId: row.classification_run_id,
    mainshockCandidateEventId: row.mainshock_candidate_event_id,
    startTime: iso(row.start_time),
    endTime: iso(row.end_time),
    eventCount: Number(row.event_count),
    maximumMagnitude: row.maximum_magnitude === null ? null : Number(row.maximum_magnitude),
    centroid: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    displayName: row.display_name,
  };
}

function encodeCursor(row: SeriesRow): string {
  return Buffer.from(JSON.stringify({ startTime: iso(row.start_time), id: row.id })).toString(
    'base64url',
  );
}

function decodeCursor(value: string): SeriesCursor {
  try {
    return SeriesCursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown,
    );
  } catch {
    throw new BadRequestException('cursor is invalid');
  }
}

@Injectable()
export class SeriesService {
  constructor(@Inject(DATABASE) private readonly database: Queryable) {}

  async search(rawQuery: Record<string, unknown>): Promise<SeriesSearchResponse> {
    const parsed = SeriesSearchQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid series search',
        issues: parsed.error.issues,
      });
    }
    const query = parsed.data;
    const run = await this.findRun(query.classificationRunId);
    if (!run) {
      return SeriesSearchResponseSchema.parse({
        series: [],
        classificationRun: null,
        nextCursor: null,
      });
    }

    const values: unknown[] = [run.id];
    let cursorClause = '';
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.startTime, cursor.id);
      cursorClause = 'AND (start_time, id) < ($2::timestamptz, $3::uuid)';
    }
    values.push(query.limit + 1);
    const result = await this.database.query<SeriesRow>(
      `SELECT id, classification_run_id, mainshock_candidate_event_id,
              start_time, end_time, event_count, maximum_magnitude,
              ST_Y(centroid::geometry) AS latitude,
              ST_X(centroid::geometry) AS longitude,
              display_name
       FROM seismic_series
       WHERE classification_run_id = $1::uuid ${cursorClause}
       ORDER BY start_time DESC, id DESC
       LIMIT $${values.length}::integer`,
      values,
    );
    const rows = result.rows.slice(0, query.limit);
    return SeriesSearchResponseSchema.parse({
      series: rows.map(toSeries),
      classificationRun: toRun(run),
      nextCursor:
        result.rows.length > query.limit && rows.length > 0 ? encodeCursor(rows.at(-1)!) : null,
    });
  }

  async findById(id: string): Promise<SeriesDetailResponse> {
    const result = await this.database.query<SeriesWithRunRow>(
      `SELECT series.id, series.classification_run_id,
              series.mainshock_candidate_event_id, series.start_time, series.end_time,
              series.event_count, series.maximum_magnitude,
              ST_Y(series.centroid::geometry) AS latitude,
              ST_X(series.centroid::geometry) AS longitude,
              series.display_name,
              run.id AS run_id, run.algorithm, run.algorithm_version, run.parameters,
              run.catalog_watermark, run.analysis_start, run.analysis_end, run.status,
              run.started_at, run.completed_at, run.input_count, run.series_count,
              run.membership_count, run.failure_count, run.error_summary
       FROM seismic_series series
       JOIN classification_runs run ON run.id = series.classification_run_id
       WHERE series.id = $1::uuid`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Candidate series was not found');

    const memberships = await this.database.query<MembershipRow>(
      `SELECT membership.canonical_event_id AS id, snapshot.origin_time,
              ST_Y(snapshot.location::geometry) AS latitude,
              ST_X(snapshot.location::geometry) AS longitude,
              snapshot.depth_km, snapshot.magnitude, snapshot.magnitude_type,
              snapshot.place, snapshot.source, snapshot.source_event_id,
              membership.role, membership.confidence, membership.explanation
       FROM series_memberships membership
       JOIN LATERAL (
         SELECT revision.origin_time, revision.location, revision.depth_km,
                revision.magnitude, revision.magnitude_type, revision.place,
                source.source, source.source_event_id
         FROM source_events source
         JOIN event_revisions revision ON revision.source_event_id = source.id
         WHERE source.canonical_event_id = membership.canonical_event_id
           AND revision.observed_at <= $2::timestamptz
         ORDER BY revision.source_updated_at DESC, revision.payload_checksum DESC
         LIMIT 1
       ) snapshot ON true
       WHERE membership.series_id = $1::uuid
       ORDER BY snapshot.origin_time, membership.canonical_event_id`,
      [id, row.catalog_watermark],
    );
    const edges = await this.database.query<EdgeRow>(
      `SELECT edge.source_event_id, edge.target_event_id, edge.time_delta_seconds,
              edge.distance_km, edge.magnitude_delta, edge.score, edge.rule, edge.accepted
       FROM series_edges edge
       WHERE edge.classification_run_id = $2::uuid
         AND edge.source_event_id IN (
           SELECT canonical_event_id FROM series_memberships WHERE series_id = $1::uuid
         )
         AND edge.target_event_id IN (
           SELECT canonical_event_id FROM series_memberships WHERE series_id = $1::uuid
         )
       ORDER BY edge.source_event_id, edge.target_event_id`,
      [id, row.classification_run_id],
    );

    return SeriesDetailResponseSchema.parse({
      series: {
        ...toSeries(row),
        classificationRun: toRun({ ...row, id: row.run_id }),
        memberships: memberships.rows.map((membership) => ({
          event: {
            id: membership.id,
            originTime: iso(membership.origin_time),
            coordinates: {
              latitude: Number(membership.latitude),
              longitude: Number(membership.longitude),
              depthKm: Number(membership.depth_km),
            },
            magnitude: membership.magnitude === null ? null : Number(membership.magnitude),
            magnitudeType: membership.magnitude_type,
            place: membership.place,
            source: membership.source,
            sourceEventId: membership.source_event_id,
          },
          role: membership.role,
          confidence: Number(membership.confidence),
          explanation: membership.explanation,
        })),
        edges: edges.rows.map((edge) => ({
          sourceEventId: edge.source_event_id,
          targetEventId: edge.target_event_id,
          timeDeltaSeconds: Number(edge.time_delta_seconds),
          distanceKm: Number(edge.distance_km),
          magnitudeDelta: edge.magnitude_delta === null ? null : Number(edge.magnitude_delta),
          score: Number(edge.score),
          rule: edge.rule,
          accepted: edge.accepted,
        })),
      },
    });
  }

  async findRunById(id: string): Promise<ClassificationRunResponse> {
    const run = await this.findRun(id);
    if (!run) throw new NotFoundException('Classification run was not found');
    return ClassificationRunResponseSchema.parse({ classificationRun: toRun(run) });
  }

  private async findRun(id?: string): Promise<RunRow | undefined> {
    const result = await this.database.query<RunRow>(
      id
        ? `SELECT * FROM classification_runs WHERE id = $1::uuid LIMIT 1`
        : `SELECT * FROM classification_runs
           WHERE status = 'succeeded'
           ORDER BY completed_at DESC, id DESC
           LIMIT 1`,
      id ? [id] : [],
    );
    return result.rows[0];
  }
}
