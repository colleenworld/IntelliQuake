import { describe, expect, it } from 'vitest';

import { CoordinatesSchema, NormalizedEventSchema } from './index';

describe('CoordinatesSchema', () => {
  it('rejects invalid geographic coordinates', () => {
    expect(
      CoordinatesSchema.safeParse({ latitude: 91, longitude: -122.3, depthKm: 8 }).success,
    ).toBe(false);
  });

  it('accepts a normalized USGS event with explicit UTC timestamps', () => {
    expect(
      NormalizedEventSchema.safeParse({
        source: 'usgs',
        sourceEventId: 'us7000test',
        sourceUpdatedAt: '2026-09-14T13:05:00.000Z',
        sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test',
        originTime: '2026-09-14T13:00:00.000Z',
        coordinates: { latitude: 47.1, longitude: -122.3, depthKm: 12.4 },
        magnitude: 4.2,
        magnitudeType: 'mww',
        place: '10 km NW of Example',
        eventType: 'earthquake',
        status: 'reviewed',
        significance: 271,
        feltReports: 18,
        tsunami: false,
      }).success,
    ).toBe(true);
  });
});
