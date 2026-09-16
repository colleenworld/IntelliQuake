import { Inject, Injectable } from '@nestjs/common';

import type { ChatCitation } from '@earthquake/contracts';
import type { EventSummary } from '@earthquake/domain';
import { z } from 'zod';

import { DATABASE, type Queryable } from '../database.provider';
import type { EventsService } from '../events.service';
import { EventsService as EventsServiceToken } from '../events.service';
import type { SeriesService } from '../series.service';
import { SeriesService as SeriesServiceToken } from '../series.service';

export const CHAT_TOOL_NAMES = [
  'search_events',
  'get_event',
  'get_nearby_events',
  'get_largest_events',
  'get_series',
  'compare_series',
] as const;
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

const timeRange = {
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
};
const SearchEventsSchema = z
  .object({
    ...timeRange,
    minimumMagnitude: z.number().min(-2).max(10).optional(),
    maximumMagnitude: z.number().min(-2).max(10).optional(),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .refine((value) => !value.startTime || !value.endTime || value.startTime < value.endTime)
  .refine(
    (value) =>
      value.minimumMagnitude === undefined ||
      value.maximumMagnitude === undefined ||
      value.minimumMagnitude <= value.maximumMagnitude,
  );
const EventIdSchema = z.object({ eventId: z.uuid() });
const NearbyEventsSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusKm: z.number().positive().max(1_000),
    minimumMagnitude: z.number().min(-2).max(10).optional(),
    ...timeRange,
    limit: z.number().int().min(1).max(25).default(10),
  })
  .refine((value) => !value.startTime || !value.endTime || value.startTime < value.endTime);
const LargestEventsSchema = z
  .object({ ...timeRange, limit: z.number().int().min(1).max(20).default(10) })
  .refine((value) => !value.startTime || !value.endTime || value.startTime < value.endTime);
const SeriesIdSchema = z.object({ seriesId: z.uuid() });
const CompareSeriesSchema = z
  .object({ firstSeriesId: z.uuid(), secondSeriesId: z.uuid() })
  .refine((value) => value.firstSeriesId !== value.secondSeriesId);

export const ChatToolArgumentSchemas = {
  search_events: SearchEventsSchema,
  get_event: EventIdSchema,
  get_nearby_events: NearbyEventsSchema,
  get_largest_events: LargestEventsSchema,
  get_series: SeriesIdSchema,
  compare_series: CompareSeriesSchema,
} as const;

export const CHAT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'search_events',
    description: 'Search catalog events by time and magnitude. Use for bounded event lists.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        startTime: { type: 'string', description: 'ISO 8601 timestamp' },
        endTime: { type: 'string', description: 'ISO 8601 timestamp' },
        minimumMagnitude: { type: 'number', minimum: -2, maximum: 10 },
        maximumMagnitude: { type: 'number', minimum: -2, maximum: 10 },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  {
    type: 'function',
    name: 'get_event',
    description: 'Get full facts and provenance for one event.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['eventId'],
      properties: { eventId: { type: 'string', format: 'uuid' } },
    },
  },
  {
    type: 'function',
    name: 'get_nearby_events',
    description: 'Find events within a radius of a coordinate.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['latitude', 'longitude', 'radiusKm'],
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
        radiusKm: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
        minimumMagnitude: { type: 'number', minimum: -2, maximum: 10 },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  {
    type: 'function',
    name: 'get_largest_events',
    description: 'Return the largest catalog events in an optional time range.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    type: 'function',
    name: 'get_series',
    description:
      'Get a candidate seismic series, inferred memberships, evidence, and run metadata.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['seriesId'],
      properties: { seriesId: { type: 'string', format: 'uuid' } },
    },
  },
  {
    type: 'function',
    name: 'compare_series',
    description: 'Compare two candidate seismic series and their inferred properties.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['firstSeriesId', 'secondSeriesId'],
      properties: {
        firstSeriesId: { type: 'string', format: 'uuid' },
        secondSeriesId: { type: 'string', format: 'uuid' },
      },
    },
  },
] as const;

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

export interface ToolExecutionResult {
  output: unknown;
  citations: ChatCitation[];
  resultCount: number;
}

const eventSummary = (row: EventRow): EventSummary => ({
  id: row.id as EventSummary['id'],
  originTime: new Date(row.origin_time).toISOString(),
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
});
const eventCitation = (event: EventSummary): ChatCitation => ({
  kind: 'event',
  id: event.id,
  label: `${event.magnitude === null ? 'Unrated' : `M ${event.magnitude.toFixed(1)}`} · ${event.place ?? 'Unnamed event'}`,
  href: `/?event=${event.id}`,
  timeRange: { start: event.originTime, end: event.originTime },
});

@Injectable()
export class CatalogChatTools {
  constructor(
    @Inject(DATABASE) private readonly database: Queryable,
    @Inject(EventsServiceToken) private readonly events: EventsService,
    @Inject(SeriesServiceToken) private readonly series: SeriesService,
  ) {}

  async execute(name: ChatToolName, rawArguments: unknown): Promise<ToolExecutionResult> {
    const args = ChatToolArgumentSchemas[name].parse(rawArguments) as never;
    switch (name) {
      case 'search_events': {
        const response = await this.events.search(args);
        return {
          output: response,
          citations: response.events.map(eventCitation),
          resultCount: response.events.length,
        };
      }
      case 'get_event': {
        const response = await this.events.findById(
          (args as z.infer<typeof EventIdSchema>).eventId,
        );
        return { output: response, citations: [eventCitation(response.event)], resultCount: 1 };
      }
      case 'get_nearby_events':
        return this.nearby(args);
      case 'get_largest_events':
        return this.largest(args);
      case 'get_series': {
        const response = await this.series.findById(
          (args as z.infer<typeof SeriesIdSchema>).seriesId,
        );
        const value = response.series;
        return {
          output: boundedSeries(value),
          citations: [
            {
              kind: 'series',
              id: value.id,
              label: value.displayName,
              href: `/?series=${value.id}`,
              timeRange: { start: value.startTime, end: value.endTime },
            },
          ],
          resultCount: 1,
        };
      }
      case 'compare_series': {
        const value = args as z.infer<typeof CompareSeriesSchema>;
        const [first, second] = await Promise.all([
          this.series.findById(value.firstSeriesId),
          this.series.findById(value.secondSeriesId),
        ]);
        const compared = [first.series, second.series];
        return {
          output: { series: compared.map(seriesComparison) },
          citations: compared.map((item) => ({
            kind: 'series' as const,
            id: item.id,
            label: item.displayName,
            href: `/?series=${item.id}`,
            timeRange: { start: item.startTime, end: item.endTime },
          })),
          resultCount: 2,
        };
      }
    }
  }

  private async nearby(args: z.infer<typeof NearbyEventsSchema>): Promise<ToolExecutionResult> {
    const values: unknown[] = [args.longitude, args.latitude, args.radiusKm * 1_000];
    const where = [
      `ST_DWithin(ce.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
    ];
    if (args.minimumMagnitude !== undefined) {
      values.push(args.minimumMagnitude);
      where.push(`ce.preferred_magnitude >= $${values.length}`);
    }
    if (args.startTime) {
      values.push(args.startTime);
      where.push(`ce.origin_time >= $${values.length}::timestamptz`);
    }
    if (args.endTime) {
      values.push(args.endTime);
      where.push(`ce.origin_time < $${values.length}::timestamptz`);
    }
    values.push(args.limit);
    return this.eventQuery(
      where,
      values,
      `ST_Distance(ce.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography), ce.origin_time DESC`,
      values.length,
    );
  }

  private async largest(args: z.infer<typeof LargestEventsSchema>): Promise<ToolExecutionResult> {
    const values: unknown[] = [];
    const where = ['ce.preferred_magnitude IS NOT NULL'];
    if (args.startTime) {
      values.push(args.startTime);
      where.push(`ce.origin_time >= $${values.length}::timestamptz`);
    }
    if (args.endTime) {
      values.push(args.endTime);
      where.push(`ce.origin_time < $${values.length}::timestamptz`);
    }
    values.push(args.limit);
    return this.eventQuery(
      where,
      values,
      'ce.preferred_magnitude DESC, ce.origin_time DESC, ce.id DESC',
      values.length,
    );
  }

  private async eventQuery(
    where: string[],
    values: unknown[],
    order: string,
    limitPosition: number,
  ): Promise<ToolExecutionResult> {
    const result = await this.database.query<EventRow>(
      `SELECT ce.id, ce.origin_time, ST_Y(ce.location::geometry) AS latitude,
              ST_X(ce.location::geometry) AS longitude, ce.depth_km,
              ce.preferred_magnitude AS magnitude, ce.preferred_magnitude_type AS magnitude_type,
              ce.place, source.source, source.source_event_id
       FROM canonical_events ce
       JOIN LATERAL (SELECT se.source, se.source_event_id FROM source_events se
         WHERE se.canonical_event_id = ce.id ORDER BY se.source, se.source_event_id LIMIT 1) source ON true
       WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${limitPosition}::integer`,
      values,
    );
    const events = result.rows.map(eventSummary);
    return { output: { events }, citations: events.map(eventCitation), resultCount: events.length };
  }
}

function boundedSeries(value: Awaited<ReturnType<SeriesService['findById']>>['series']) {
  return {
    id: value.id,
    displayName: value.displayName,
    startTime: value.startTime,
    endTime: value.endTime,
    eventCount: value.eventCount,
    maximumMagnitude: value.maximumMagnitude,
    centroid: value.centroid,
    mainshockCandidateEventId: value.mainshockCandidateEventId,
    classification: {
      algorithm: value.classificationRun.algorithm,
      algorithmVersion: value.classificationRun.algorithmVersion,
      catalogWatermark: value.classificationRun.catalogWatermark,
    },
    memberships: value.memberships.slice(0, 50).map((membership) => ({
      eventId: membership.event.id,
      originTime: membership.event.originTime,
      magnitude: membership.event.magnitude,
      place: membership.event.place,
      role: membership.role,
      confidence: membership.confidence,
      explanation: membership.explanation,
    })),
    membershipResultTruncated: value.memberships.length > 50,
    acceptedEdges: value.edges.filter((edge) => edge.accepted).slice(0, 100),
    edgeResultTruncated: value.edges.filter((edge) => edge.accepted).length > 100,
  };
}

function seriesComparison(value: Awaited<ReturnType<SeriesService['findById']>>['series']) {
  const roleCounts = value.memberships.reduce<Record<string, number>>((counts, membership) => {
    counts[membership.role] = (counts[membership.role] ?? 0) + 1;
    return counts;
  }, {});
  return {
    id: value.id,
    displayName: value.displayName,
    startTime: value.startTime,
    endTime: value.endTime,
    eventCount: value.eventCount,
    maximumMagnitude: value.maximumMagnitude,
    centroid: value.centroid,
    mainshockCandidateEventId: value.mainshockCandidateEventId,
    algorithmVersion: value.classificationRun.algorithmVersion,
    roleCounts,
  };
}
