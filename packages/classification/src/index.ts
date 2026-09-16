import { createHash } from 'node:crypto';

import type { EventId, EventSummary } from '@earthquake/domain';
import { z } from 'zod';

export const CLASSIFIER_ALGORITHM = 'deterministic-space-time';
export const CLASSIFIER_VERSION = '1.0.0';
export const CLASSIFIER_RULE = 'magnitude-adjusted-space-time-v1';

export const ClassifierParametersSchema = z
  .object({
    baseTimeWindowHours: z.number().positive().max(720),
    baseDistanceKm: z.number().positive().max(2_000),
    magnitudeReference: z.number().min(-2).max(10),
    magnitudeWindowScale: z.number().nonnegative().max(2),
    timeWeight: z.number().nonnegative().max(1),
    distanceWeight: z.number().nonnegative().max(1),
    magnitudeWeight: z.number().nonnegative().max(1),
    minimumEdgeScore: z.number().min(0).max(1),
    minimumSeriesSize: z.number().int().min(2).max(1_000),
  })
  .refine(
    ({ timeWeight, distanceWeight, magnitudeWeight }) =>
      Math.abs(timeWeight + distanceWeight + magnitudeWeight - 1) < 1e-9,
    { message: 'classifier weights must sum to 1' },
  );

export type ClassifierParameters = z.infer<typeof ClassifierParametersSchema>;

export const DEFAULT_CLASSIFIER_PARAMETERS: Readonly<ClassifierParameters> = Object.freeze({
  baseTimeWindowHours: 24,
  baseDistanceKm: 60,
  magnitudeReference: 4,
  magnitudeWindowScale: 0.5,
  timeWeight: 0.4,
  distanceWeight: 0.4,
  magnitudeWeight: 0.2,
  minimumEdgeScore: 0.45,
  minimumSeriesSize: 2,
});

export type ClassifiableEvent = Pick<
  EventSummary,
  'coordinates' | 'id' | 'magnitude' | 'originTime' | 'place'
>;

export interface CandidateEdge {
  sourceEventId: EventId;
  targetEventId: EventId;
  timeDeltaSeconds: number;
  distanceKm: number;
  magnitudeDelta: number | null;
  score: number;
  rule: typeof CLASSIFIER_RULE;
  accepted: boolean;
}

export interface MembershipExplanation {
  relatedEventId: EventId;
  timeDeltaSeconds: number;
  distanceKm: number;
  rule: typeof CLASSIFIER_RULE;
  edgeScore: number;
}

export type SeriesRole = 'earlier_event' | 'mainshock_candidate' | 'later_event';

export interface CandidateMembership {
  eventId: EventId;
  role: SeriesRole;
  confidence: number;
  explanation: MembershipExplanation;
}

export interface CandidateSeries {
  key: string;
  mainshockCandidateEventId: EventId;
  startTime: string;
  endTime: string;
  eventCount: number;
  maximumMagnitude: number | null;
  centroid: { latitude: number; longitude: number };
  displayName: string;
  memberships: CandidateMembership[];
}

export interface ClassificationResult {
  algorithm: typeof CLASSIFIER_ALGORITHM;
  algorithmVersion: typeof CLASSIFIER_VERSION;
  parameters: ClassifierParameters;
  inputCount: number;
  edges: CandidateEdge[];
  series: CandidateSeries[];
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

export function distanceKm(
  first: ClassifiableEvent['coordinates'],
  second: ClassifiableEvent['coordinates'],
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return rounded(6_371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function compareEvents(first: ClassifiableEvent, second: ClassifiableEvent): number {
  return first.originTime.localeCompare(second.originTime) || first.id.localeCompare(second.id);
}

function magnitudeFactor(
  first: ClassifiableEvent,
  second: ClassifiableEvent,
  parameters: ClassifierParameters,
): number {
  const largerMagnitude = Math.max(
    first.magnitude ?? parameters.magnitudeReference,
    second.magnitude ?? parameters.magnitudeReference,
  );
  return (
    1 +
    Math.max(0, largerMagnitude - parameters.magnitudeReference) * parameters.magnitudeWindowScale
  );
}

function evaluateEdge(
  source: ClassifiableEvent,
  target: ClassifiableEvent,
  parameters: ClassifierParameters,
): CandidateEdge | undefined {
  const timeDeltaSeconds = Math.round(
    (Date.parse(target.originTime) - Date.parse(source.originTime)) / 1_000,
  );
  const factor = magnitudeFactor(source, target, parameters);
  const maximumTimeSeconds = parameters.baseTimeWindowHours * 3_600 * factor;
  if (timeDeltaSeconds > maximumTimeSeconds) return undefined;

  const spatialSeparation = distanceKm(source.coordinates, target.coordinates);
  const maximumDistanceKm = parameters.baseDistanceKm * factor;
  if (spatialSeparation > maximumDistanceKm) return undefined;

  const magnitudeDelta =
    source.magnitude === null || target.magnitude === null
      ? null
      : rounded(Math.abs(source.magnitude - target.magnitude));
  const timeScore = 1 - timeDeltaSeconds / maximumTimeSeconds;
  const distanceScore = 1 - spatialSeparation / maximumDistanceKm;
  const magnitudeScore = magnitudeDelta === null ? 0.5 : Math.max(0, 1 - magnitudeDelta / 10);
  const score = rounded(
    timeScore * parameters.timeWeight +
      distanceScore * parameters.distanceWeight +
      magnitudeScore * parameters.magnitudeWeight,
  );

  return {
    sourceEventId: source.id,
    targetEventId: target.id,
    timeDeltaSeconds,
    distanceKm: spatialSeparation,
    magnitudeDelta,
    score,
    rule: CLASSIFIER_RULE,
    accepted: score >= parameters.minimumEdgeScore,
  };
}

function centroid(events: ClassifiableEvent[]): { latitude: number; longitude: number } {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const degrees = (value: number) => (value * 180) / Math.PI;
  const vector = events.reduce(
    (sum, event) => {
      const latitude = radians(event.coordinates.latitude);
      const longitude = radians(event.coordinates.longitude);
      sum.x += Math.cos(latitude) * Math.cos(longitude);
      sum.y += Math.cos(latitude) * Math.sin(longitude);
      sum.z += Math.sin(latitude);
      return sum;
    },
    { x: 0, y: 0, z: 0 },
  );
  const longitude = Math.atan2(vector.y, vector.x);
  const horizontal = Math.sqrt(vector.x ** 2 + vector.y ** 2);
  return {
    latitude: rounded(degrees(Math.atan2(vector.z, horizontal))),
    longitude: rounded(degrees(longitude)),
  };
}

function seriesKey(eventIds: EventId[], parameters: ClassifierParameters): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        algorithm: CLASSIFIER_ALGORITHM,
        algorithmVersion: CLASSIFIER_VERSION,
        parameters,
        eventIds,
      }),
    )
    .digest('hex');
}

export function classifyEvents(
  input: readonly ClassifiableEvent[],
  rawParameters: ClassifierParameters = DEFAULT_CLASSIFIER_PARAMETERS,
): ClassificationResult {
  const parameters = ClassifierParametersSchema.parse(rawParameters);
  const events = [...input].sort(compareEvents);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const parent = new Map(events.map((event) => [event.id, event.id]));
  const find = (id: EventId): EventId => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (first: EventId, second: EventId): void => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot === secondRoot) return;
    parent.set(
      firstRoot < secondRoot ? secondRoot : firstRoot,
      firstRoot < secondRoot ? firstRoot : secondRoot,
    );
  };

  const edges: CandidateEdge[] = [];
  for (let sourceIndex = 0; sourceIndex < events.length; sourceIndex += 1) {
    const source = events[sourceIndex]!;
    for (let targetIndex = sourceIndex + 1; targetIndex < events.length; targetIndex += 1) {
      const target = events[targetIndex]!;
      const edge = evaluateEdge(source, target, parameters);
      if (!edge) continue;
      edges.push(edge);
      if (edge.accepted) union(source.id, target.id);
    }
  }

  const components = new Map<EventId, EventId[]>();
  for (const event of events) {
    const root = find(event.id);
    components.set(root, [...(components.get(root) ?? []), event.id]);
  }

  const series = [...components.values()]
    .filter((eventIds) => eventIds.length >= parameters.minimumSeriesSize)
    .map((eventIds): CandidateSeries => {
      const members = eventIds.map((id) => eventById.get(id)!);
      const mainshock = [...members].sort(
        (first, second) =>
          (second.magnitude ?? Number.NEGATIVE_INFINITY) -
            (first.magnitude ?? Number.NEGATIVE_INFINITY) || compareEvents(first, second),
      )[0]!;
      const orderedIds = members.sort(compareEvents).map((event) => event.id);
      const mainshockIndex = orderedIds.indexOf(mainshock.id);
      const memberships = orderedIds.map((eventId, index): CandidateMembership => {
        const evidence = edges
          .filter(
            (edge) =>
              edge.accepted &&
              (edge.sourceEventId === eventId || edge.targetEventId === eventId) &&
              eventIds.includes(
                edge.sourceEventId === eventId ? edge.targetEventId : edge.sourceEventId,
              ),
          )
          .sort(
            (first, second) =>
              second.score - first.score ||
              first.sourceEventId.localeCompare(second.sourceEventId) ||
              first.targetEventId.localeCompare(second.targetEventId),
          )[0]!;
        const relatedEventId =
          evidence.sourceEventId === eventId ? evidence.targetEventId : evidence.sourceEventId;
        return {
          eventId,
          role:
            eventId === mainshock.id
              ? 'mainshock_candidate'
              : index < mainshockIndex
                ? 'earlier_event'
                : 'later_event',
          confidence: evidence.score,
          explanation: {
            relatedEventId,
            timeDeltaSeconds: evidence.timeDeltaSeconds,
            distanceKm: evidence.distanceKm,
            rule: evidence.rule,
            edgeScore: evidence.score,
          },
        };
      });
      return {
        key: seriesKey(orderedIds, parameters),
        mainshockCandidateEventId: mainshock.id,
        startTime: members[0]!.originTime,
        endTime: members.at(-1)!.originTime,
        eventCount: members.length,
        maximumMagnitude: mainshock.magnitude,
        centroid: centroid(members),
        displayName: `Candidate series near ${mainshock.place ?? 'an unnamed region'}`,
        memberships,
      };
    })
    .sort(
      (first, second) =>
        first.startTime.localeCompare(second.startTime) || first.key.localeCompare(second.key),
    );

  return {
    algorithm: CLASSIFIER_ALGORITHM,
    algorithmVersion: CLASSIFIER_VERSION,
    parameters,
    inputCount: events.length,
    edges,
    series,
  };
}
