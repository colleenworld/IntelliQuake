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
