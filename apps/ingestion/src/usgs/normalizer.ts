import { NormalizedEventSchema, type NormalizedEvent } from '@earthquake/domain';

import { UsgsFeatureSchema, type UsgsFeature } from './schema';

export const NORMALIZER_VERSION = 'usgs-geojson-v1';

export function normalizeUsgsFeature(input: unknown): NormalizedEvent {
  const feature: UsgsFeature = UsgsFeatureSchema.parse(input);
  const [longitude, latitude, depthKm] = feature.geometry.coordinates;

  return NormalizedEventSchema.parse({
    source: 'usgs',
    sourceEventId: feature.id,
    sourceUpdatedAt: new Date(feature.properties.updated).toISOString(),
    sourceUrl: feature.properties.url,
    originTime: new Date(feature.properties.time).toISOString(),
    coordinates: { latitude, longitude, depthKm },
    magnitude: feature.properties.mag,
    magnitudeType: feature.properties.magType,
    place: feature.properties.place,
    eventType: feature.properties.type,
    status: feature.properties.status,
    significance: feature.properties.sig,
    feltReports: feature.properties.felt,
    tsunami: feature.properties.tsunami === 1,
  });
}
