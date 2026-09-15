import { z } from 'zod';

export const EventIdSchema = z.string().uuid().brand<'EventId'>();
export type EventId = z.infer<typeof EventIdSchema>;

export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  depthKm: z.number().min(-100).max(1000),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const EventSummarySchema = z.object({
  id: EventIdSchema,
  originTime: z.iso.datetime({ offset: true }),
  coordinates: CoordinatesSchema,
  magnitude: z.number().nullable(),
  magnitudeType: z.string().nullable(),
  place: z.string().nullable(),
  source: z.string().min(1),
  sourceEventId: z.string().min(1),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const EventDetailSchema = EventSummarySchema.extend({
  eventType: z.string().min(1),
  status: z.string().min(1),
  significance: z.number().int().nonnegative(),
  feltReports: z.number().int().nonnegative().nullable(),
  tsunami: z.boolean(),
  sourceUrl: z.url(),
  sourceUpdatedAt: z.iso.datetime({ offset: true }),
  firstObservedAt: z.iso.datetime({ offset: true }),
  lastObservedAt: z.iso.datetime({ offset: true }),
  revisionCount: z.number().int().positive(),
});
export type EventDetail = z.infer<typeof EventDetailSchema>;

export const NormalizedEventSchema = z.object({
  source: z.literal('usgs'),
  sourceEventId: z.string().min(1),
  sourceUpdatedAt: z.iso.datetime({ offset: true }),
  sourceUrl: z.url(),
  originTime: z.iso.datetime({ offset: true }),
  coordinates: CoordinatesSchema,
  magnitude: z.number().nullable(),
  magnitudeType: z.string().nullable(),
  place: z.string().nullable(),
  eventType: z.string().min(1),
  status: z.string().min(1),
  significance: z.number().int().nonnegative(),
  feltReports: z.number().int().nonnegative().nullable(),
  tsunami: z.boolean(),
});
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export type RevisionOutcome = 'created' | 'revised' | 'unchanged';
