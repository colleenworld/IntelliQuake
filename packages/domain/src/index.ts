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

export const SeriesIdSchema = z.string().uuid().brand<'SeriesId'>();
export type SeriesId = z.infer<typeof SeriesIdSchema>;

export const ClassificationRunIdSchema = z.string().uuid().brand<'ClassificationRunId'>();
export type ClassificationRunId = z.infer<typeof ClassificationRunIdSchema>;

export const ClassificationRunSchema = z.object({
  id: ClassificationRunIdSchema,
  algorithm: z.string().min(1),
  algorithmVersion: z.string().min(1),
  parameters: z.record(z.string(), z.number()),
  catalogWatermark: z.iso.datetime({ offset: true }),
  analysisStart: z.iso.datetime({ offset: true }),
  analysisEnd: z.iso.datetime({ offset: true }),
  status: z.enum(['running', 'succeeded', 'failed']),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  inputCount: z.number().int().nonnegative(),
  seriesCount: z.number().int().nonnegative(),
  membershipCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  errorSummary: z.string().nullable(),
});
export type ClassificationRun = z.infer<typeof ClassificationRunSchema>;

export const SeriesSummarySchema = z.object({
  id: SeriesIdSchema,
  classificationRunId: ClassificationRunIdSchema,
  mainshockCandidateEventId: EventIdSchema,
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
  eventCount: z.number().int().min(2),
  maximumMagnitude: z.number().nullable(),
  centroid: CoordinatesSchema.omit({ depthKm: true }),
  displayName: z.string().min(1),
});
export type SeriesSummary = z.infer<typeof SeriesSummarySchema>;

export const SeriesMembershipSchema = z.object({
  event: EventSummarySchema,
  role: z.enum(['earlier_event', 'mainshock_candidate', 'later_event']),
  confidence: z.number().min(0).max(1),
  explanation: z.object({
    relatedEventId: EventIdSchema,
    timeDeltaSeconds: z.number().int().nonnegative(),
    distanceKm: z.number().nonnegative(),
    rule: z.string().min(1),
    edgeScore: z.number().min(0).max(1),
  }),
});
export type SeriesMembership = z.infer<typeof SeriesMembershipSchema>;

export const SeriesEdgeSchema = z.object({
  sourceEventId: EventIdSchema,
  targetEventId: EventIdSchema,
  timeDeltaSeconds: z.number().int().nonnegative(),
  distanceKm: z.number().nonnegative(),
  magnitudeDelta: z.number().nonnegative().nullable(),
  score: z.number().min(0).max(1),
  rule: z.string().min(1),
  accepted: z.boolean(),
});
export type SeriesEdge = z.infer<typeof SeriesEdgeSchema>;

export const SeriesDetailSchema = SeriesSummarySchema.extend({
  classificationRun: ClassificationRunSchema,
  memberships: z.array(SeriesMembershipSchema).min(2),
  edges: z.array(SeriesEdgeSchema),
});
export type SeriesDetail = z.infer<typeof SeriesDetailSchema>;

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
