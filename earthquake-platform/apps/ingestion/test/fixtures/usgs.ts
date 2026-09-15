import type { UsgsFeature, UsgsFeatureCollection } from '../../src/usgs/schema';

export function makeUsgsFeature(
  overrides: Partial<UsgsFeature['properties']> & { id?: string } = {},
): UsgsFeature {
  const { id = 'us7000test', ...propertyOverrides } = overrides;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [-122.3, 47.1, 12.4] },
    properties: {
      mag: 4.2,
      place: '10 km NW of Example',
      time: Date.parse('2026-09-14T13:00:00.000Z'),
      updated: Date.parse('2026-09-14T13:05:00.000Z'),
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
      felt: 18,
      cdi: 3.2,
      mmi: null,
      alert: null,
      status: 'reviewed',
      tsunami: 0,
      sig: 271,
      net: 'us',
      code: '7000test',
      ids: `,${id},`,
      sources: ',us,',
      types: ',origin,phase-data,',
      nst: 41,
      dmin: 0.22,
      rms: 0.8,
      gap: 73,
      magType: 'mww',
      type: 'earthquake',
      ...propertyOverrides,
    },
  };
}

export function makeUsgsCollection(features = [makeUsgsFeature()]): UsgsFeatureCollection {
  return {
    type: 'FeatureCollection',
    metadata: {
      generated: Date.parse('2026-09-14T13:10:00.000Z'),
      url: 'https://earthquake.usgs.gov/example.geojson',
      title: 'Test earthquakes',
      api: '1.14.1',
      count: features.length,
      status: 200,
    },
    features,
  };
}
