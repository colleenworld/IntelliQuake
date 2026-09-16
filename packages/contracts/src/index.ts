import {
  ClassificationRunSchema,
  EventDetailSchema,
  SeriesDetailSchema,
  SeriesSummarySchema,
  EventSummarySchema,
} from '@earthquake/domain';
import { z } from 'zod';

export const EventSearchQuerySchema = z
  .object({
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
    minimumMagnitude: z.coerce.number().min(-2).max(10).optional(),
    maximumMagnitude: z.coerce.number().min(-2).max(10).optional(),
    south: z.coerce.number().min(-90).max(90).optional(),
    west: z.coerce.number().min(-180).max(180).optional(),
    north: z.coerce.number().min(-90).max(90).optional(),
    east: z.coerce.number().min(-180).max(180).optional(),
    seriesId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().optional(),
  })
  .refine(
    ({ startTime, endTime }) =>
      startTime === undefined || endTime === undefined || startTime < endTime,
    { message: 'startTime must precede endTime' },
  )
  .refine(
    ({ minimumMagnitude, maximumMagnitude }) =>
      minimumMagnitude === undefined ||
      maximumMagnitude === undefined ||
      minimumMagnitude <= maximumMagnitude,
    { message: 'minimumMagnitude must not exceed maximumMagnitude' },
  )
  .refine(
    ({ south, west, north, east }) => {
      const bounds = [south, west, north, east];
      return (
        bounds.every((value) => value === undefined) || bounds.every((value) => value !== undefined)
      );
    },
    { message: 'south, west, north, and east must be supplied together' },
  )
  .refine(
    ({ south, west, north, east }) =>
      south === undefined ||
      west === undefined ||
      north === undefined ||
      east === undefined ||
      (south < north && west < east),
    { message: 'map bounds must have south < north and west < east' },
  );

export const EventSearchResponseSchema = z.object({
  events: z.array(EventSummarySchema),
  nextCursor: z.string().nullable(),
});

export type EventSearchQuery = z.infer<typeof EventSearchQuerySchema>;
export type EventSearchResponse = z.infer<typeof EventSearchResponseSchema>;

export const EventDetailResponseSchema = z.object({ event: EventDetailSchema });
export type EventDetailResponse = z.infer<typeof EventDetailResponseSchema>;

export const SeriesSearchQuerySchema = z.object({
  classificationRunId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type SeriesSearchQuery = z.infer<typeof SeriesSearchQuerySchema>;

export const SeriesSearchResponseSchema = z.object({
  series: z.array(SeriesSummarySchema),
  classificationRun: ClassificationRunSchema.nullable(),
  nextCursor: z.string().nullable(),
});
export type SeriesSearchResponse = z.infer<typeof SeriesSearchResponseSchema>;

export const SeriesDetailResponseSchema = z.object({ series: SeriesDetailSchema });
export type SeriesDetailResponse = z.infer<typeof SeriesDetailResponseSchema>;

export const ClassificationRunResponseSchema = z.object({
  classificationRun: ClassificationRunSchema,
});
export type ClassificationRunResponse = z.infer<typeof ClassificationRunResponseSchema>;

export const IngestionModeSchema = z.enum(['poll', 'backfill', 'replay']);

export const RawEventMessageSchema = z.object({
  schemaVersion: z.literal(1),
  messageType: z.literal('raw-event-available'),
  ingestionRunId: z.uuid(),
  ingestionMode: IngestionModeSchema,
  source: z.literal('usgs'),
  sourceEventId: z.string().min(1),
  sourceUpdatedAt: z.iso.datetime({ offset: true }),
  rawObjectKey: z.string().min(1),
  rawObjectChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime({ offset: true }),
});

export type IngestionMode = z.infer<typeof IngestionModeSchema>;
export type RawEventMessage = z.infer<typeof RawEventMessageSchema>;
