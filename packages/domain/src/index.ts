import { z } from 'zod';

export const EventIdSchema = z.string().uuid().brand<'EventId'>();
export type EventId = z.infer<typeof EventIdSchema>;

export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  depthKm: z.number().nonnegative(),
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
