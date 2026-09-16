import { describe, expect, it } from 'vitest';

import type { EventSummary } from '@earthquake/domain';

import { classifyEvents, DEFAULT_CLASSIFIER_PARAMETERS, distanceKm } from './index';

function event(
  id: string,
  originTime: string,
  latitude: number,
  longitude: number,
  magnitude: number,
): EventSummary {
  return {
    id: id as EventSummary['id'],
    originTime,
    coordinates: { latitude, longitude, depthKm: 10 },
    magnitude,
    magnitudeType: 'mww',
    place: 'Cook Strait',
    source: 'usgs',
    sourceEventId: id,
  };
}

const fixtures = [
  event('00000000-0000-4000-8000-000000000001', '2026-09-14T00:00:00.000Z', -41, 174, 3.8),
  event('00000000-0000-4000-8000-000000000002', '2026-09-14T02:00:00.000Z', -41.1, 174.1, 5.2),
  event('00000000-0000-4000-8000-000000000003', '2026-09-14T04:00:00.000Z', -41.2, 174.2, 4.1),
  event('00000000-0000-4000-8000-000000000004', '2026-09-20T00:00:00.000Z', 40, -120, 6),
];

describe('candidate series classifier', () => {
  it('produces deterministic memberships regardless of input order', () => {
    const forward = classifyEvents(fixtures);
    const reverse = classifyEvents([...fixtures].reverse());

    expect(reverse).toEqual(forward);
    expect(forward.series).toHaveLength(1);
    expect(forward.series[0]?.memberships.map((membership) => membership.eventId)).toEqual(
      fixtures.slice(0, 3).map((item) => item.id),
    );
  });

  it('selects a deterministic mainshock and explains every inferred membership', () => {
    const result = classifyEvents(fixtures);
    const series = result.series[0]!;

    expect(series.mainshockCandidateEventId).toBe(fixtures[1]?.id);
    expect(series.memberships.find((item) => item.role === 'mainshock_candidate')?.eventId).toBe(
      fixtures[1]?.id,
    );
    expect(series.memberships.every((item) => item.explanation.relatedEventId)).toBe(true);
    expect(series.memberships.every((item) => item.confidence >= 0.45)).toBe(true);
  });

  it('uses larger magnitudes to expand configured space-time windows', () => {
    const first = event(
      '00000000-0000-4000-8000-000000000011',
      '2026-09-14T00:00:00.000Z',
      0,
      0,
      7,
    );
    const second = event(
      '00000000-0000-4000-8000-000000000012',
      '2026-09-15T12:00:00.000Z',
      0,
      0.5,
      3,
    );

    expect(classifyEvents([first, second]).edges).toHaveLength(1);
    expect(
      classifyEvents([first, second], {
        ...DEFAULT_CLASSIFIER_PARAMETERS,
        magnitudeWindowScale: 0,
      }).edges,
    ).toHaveLength(0);
  });

  it('computes reproducible great-circle distance in kilometres', () => {
    expect(distanceKm(fixtures[0]!.coordinates, fixtures[1]!.coordinates)).toBeCloseTo(13.93, 1);
  });

  it('rejects parameter sets whose scoring weights are not normalized', () => {
    expect(() =>
      classifyEvents(fixtures, { ...DEFAULT_CLASSIFIER_PARAMETERS, timeWeight: 0.8 }),
    ).toThrow('classifier weights must sum to 1');
  });
});
