import { EventSummarySchema } from '@earthquake/domain';
import { z } from 'zod';

export const EventSearchQuerySchema = z
  .object({
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
    minimumMagnitude: z.coerce.number().min(-2).max(10).optional(),
    maximumMagnitude: z.coerce.number().min(-2).max(10).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().optional(),
  })
  .refine(
    ({ minimumMagnitude, maximumMagnitude }) =>
      minimumMagnitude === undefined ||
      maximumMagnitude === undefined ||
      minimumMagnitude <= maximumMagnitude,
    { message: 'minimumMagnitude must not exceed maximumMagnitude' },
  );

export const EventSearchResponseSchema = z.object({
  events: z.array(EventSummarySchema),
  nextCursor: z.string().nullable(),
});

export type EventSearchQuery = z.infer<typeof EventSearchQuerySchema>;
export type EventSearchResponse = z.infer<typeof EventSearchResponseSchema>;

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
