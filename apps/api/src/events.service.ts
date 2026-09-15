import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  EventDetailResponseSchema,
  EventSearchQuerySchema,
  EventSearchResponseSchema,
  type EventDetailResponse,
  type EventSearchResponse,
} from '@earthquake/contracts';

import { DATABASE, type Queryable } from './database.provider';

interface EventRow extends Record<string, unknown> {
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
}

interface EventDetailRow extends EventRow {
  event_type: string;
  status: string;
  significance: number | string;
  felt_reports: number | string | null;
  tsunami: boolean;
  source_url: string;
  source_updated_at: Date | string;
  first_observed_at: Date | string;
  last_observed_at: Date | string;
  revision_count: number | string;
}

interface EventCursor {
  originTime: string;
  id: string;
}

function dateToIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function encodeCursor(row: EventRow): string {
  return Buffer.from(
    JSON.stringify({ originTime: dateToIso(row.origin_time), id: row.id } satisfies EventCursor),
  ).toString('base64url');
}

function decodeCursor(cursor: string): EventCursor {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('originTime' in value) ||
      !('id' in value) ||
      typeof value.originTime !== 'string' ||
      typeof value.id !== 'string' ||
      Number.isNaN(Date.parse(value.originTime))
    ) {
      throw new Error('Invalid cursor payload');
    }
    return { originTime: value.originTime, id: value.id };
  } catch {
    throw new BadRequestException('cursor is invalid');
  }
}

function toSummary(row: EventRow) {
  return {
    id: row.id,
    originTime: dateToIso(row.origin_time),
    coordinates: {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      depthKm: Number(row.depth_km),
    },
    magnitude: row.magnitude === null ? null : Number(row.magnitude),
    magnitudeType: row.magnitude_type,
    place: row.place,
    source: row.source,
    sourceEventId: row.source_event_id,
  };
}

@Injectable()
export class EventsService {
  constructor(@Inject(DATABASE) private readonly database: Queryable) {}

  async search(rawQuery: Record<string, unknown>): Promise<EventSearchResponse> {
    const parsed = EventSearchQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid event search',
        issues: parsed.error.issues,
      });
    }

    const query = parsed.data;
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.startTime) where.push(`ce.origin_time >= ${add(query.startTime)}::timestamptz`);
    if (query.endTime) where.push(`ce.origin_time < ${add(query.endTime)}::timestamptz`);
    if (query.minimumMagnitude !== undefined) {
      where.push(`ce.preferred_magnitude >= ${add(query.minimumMagnitude)}::numeric`);
    }
    if (query.maximumMagnitude !== undefined) {
      where.push(`ce.preferred_magnitude <= ${add(query.maximumMagnitude)}::numeric`);
    }
    if (
      query.south !== undefined &&
      query.west !== undefined &&
      query.north !== undefined &&
      query.east !== undefined
    ) {
      const west = add(query.west);
      const south = add(query.south);
      const east = add(query.east);
      const north = add(query.north);
      where.push(
        `ST_Intersects(ce.location, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography)`,
      );
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      where.push(
        `(ce.origin_time, ce.id) < (${add(cursor.originTime)}::timestamptz, ${add(cursor.id)}::uuid)`,
      );
    }

    const result = await this.database.query<EventRow>(
      `SELECT ce.id, ce.origin_time,
              ST_Y(ce.location::geometry) AS latitude,
              ST_X(ce.location::geometry) AS longitude,
              ce.depth_km, ce.preferred_magnitude AS magnitude,
              ce.preferred_magnitude_type AS magnitude_type, ce.place,
              source.source, source.source_event_id
       FROM canonical_events ce
       JOIN LATERAL (
         SELECT se.source, se.source_event_id
         FROM source_events se
         WHERE se.canonical_event_id = ce.id
         ORDER BY se.source, se.source_event_id
         LIMIT 1
       ) source ON true
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ce.origin_time DESC, ce.id DESC
       LIMIT ${add(query.limit + 1)}::integer`,
      values,
    );

    const hasMore = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    return EventSearchResponseSchema.parse({
      events: rows.map(toSummary),
      nextCursor: hasMore && rows.length > 0 ? encodeCursor(rows.at(-1)!) : null,
    });
  }

  async findById(id: string): Promise<EventDetailResponse> {
    const result = await this.database.query<EventDetailRow>(
      `SELECT ce.id, ce.origin_time,
              ST_Y(ce.location::geometry) AS latitude,
              ST_X(ce.location::geometry) AS longitude,
              ce.depth_km, ce.preferred_magnitude AS magnitude,
              ce.preferred_magnitude_type AS magnitude_type, ce.place,
              ce.event_type, ce.status, ce.significance, ce.felt_reports, ce.tsunami,
              ce.first_observed_at, ce.last_observed_at,
              se.source, se.source_event_id, se.source_url,
              er.source_updated_at,
              (SELECT count(*) FROM event_revisions revisions
               WHERE revisions.source_event_id = se.id) AS revision_count
       FROM canonical_events ce
       JOIN event_revisions er ON er.id = ce.current_source_revision_id
       JOIN source_events se ON se.id = er.source_event_id
       WHERE ce.id = $1::uuid
       LIMIT 1`,
      [id],
    );

    const row = result.rows[0];
    if (!row) throw new NotFoundException('Event was not found');

    return EventDetailResponseSchema.parse({
      event: {
        ...toSummary(row),
        eventType: row.event_type,
        status: row.status,
        significance: Number(row.significance),
        feltReports: row.felt_reports === null ? null : Number(row.felt_reports),
        tsunami: row.tsunami,
        sourceUrl: row.source_url,
        sourceUpdatedAt: dateToIso(row.source_updated_at),
        firstObservedAt: dateToIso(row.first_observed_at),
        lastObservedAt: dateToIso(row.last_observed_at),
        revisionCount: Number(row.revision_count),
      },
    });
  }
}
