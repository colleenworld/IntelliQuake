import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';

interface MapEvent {
  id: string;
  coordinates: { latitude: number; longitude: number };
  magnitude: number | null;
  place: string | null;
}

interface EventMapProps {
  events: readonly MapEvent[];
  selectedEventId: string | null;
  seriesMemberIds: readonly string[];
  mainshockCandidateEventId: string | null;
  onSelect: (id: string) => void;
  onDegraded: (message: string) => void;
}

function eventData(
  events: readonly MapEvent[],
  seriesMemberIds: readonly string[],
  mainshockCandidateEventId: string | null,
  selectedEventId: string | null,
) {
  const memberIds = new Set(seriesMemberIds);
  return {
    type: 'FeatureCollection' as const,
    features: events.map((event) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [event.coordinates.longitude, event.coordinates.latitude],
      },
      properties: {
        id: event.id,
        magnitude: event.magnitude ?? 0,
        place: event.place ?? '',
        seriesMember: memberIds.has(event.id),
        mainshockCandidate: event.id === mainshockCandidateEventId,
        selected: event.id === selectedEventId,
      },
    })),
  };
}

export function EventMap({
  events,
  selectedEventId,
  seriesMemberIds,
  mainshockCandidateEventId,
  onSelect,
  onDegraded,
}: EventMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const selectHandler = useRef(onSelect);
  const degradedHandler = useRef(onDegraded);
  const fittedEventSet = useRef('');

  selectHandler.current = onSelect;
  degradedHandler.current = onDegraded;

  useEffect(() => {
    if (!container.current || map.current) return;
    try {
      const instance = new maplibregl.Map({
        container: container.current,
        style:
          import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron',
        center: [0, 15],
        zoom: 1.2,
        attributionControl: false,
      });
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      instance.on('load', () => {
        instance.addSource('events', { type: 'geojson', data: eventData([], [], null, null) });
        instance.addLayer({
          id: 'event-halos',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-radius': ['+', 6, ['*', 1.7, ['get', 'magnitude']]],
            'circle-color': '#07131f',
            'circle-opacity': 0.55,
          },
        });
        instance.addLayer({
          id: 'events',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-radius': ['+', 3, ['*', 1.25, ['get', 'magnitude']]],
            'circle-color': [
              'case',
              ['get', 'selected'],
              '#f0ad4e',
              ['get', 'mainshockCandidate'],
              '#ff6f91',
              ['get', 'seriesMember'],
              '#a78bfa',
              '#66d5c8',
            ],
            'circle-stroke-color': '#e8f0f5',
            'circle-stroke-width': [
              'case',
              ['get', 'mainshockCandidate'],
              3,
              ['get', 'seriesMember'],
              2,
              1,
            ],
          },
        });
        instance.on('click', 'events', (event: MapLayerMouseEvent) => {
          const id = event.features?.[0]?.properties.id as unknown;
          if (typeof id === 'string') selectHandler.current(id);
        });
        instance.on('mouseenter', 'events', () => {
          instance.getCanvas().style.cursor = 'pointer';
        });
        instance.on('mouseleave', 'events', () => {
          instance.getCanvas().style.cursor = '';
        });
      });
      instance.on('error', () => {
        degradedHandler.current('The basemap is unavailable; event data remains accessible below.');
      });
      map.current = instance;
    } catch {
      degradedHandler.current('WebGL mapping is unavailable; event data remains accessible below.');
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded()) {
      const updateAfterLoad = () => {
        (instance?.getSource('events') as GeoJSONSource | undefined)?.setData(
          eventData(events, seriesMemberIds, mainshockCandidateEventId, selectedEventId),
        );
      };
      instance?.once('load', updateAfterLoad);
      return () => {
        instance?.off('load', updateAfterLoad);
      };
    }
    (instance.getSource('events') as GeoJSONSource | undefined)?.setData(
      eventData(events, seriesMemberIds, mainshockCandidateEventId, selectedEventId),
    );
    const eventSet = events.map((event) => event.id).join(',');
    if (events.length > 0 && fittedEventSet.current !== eventSet) {
      const bounds = new maplibregl.LngLatBounds();
      events.forEach((event) =>
        bounds.extend([event.coordinates.longitude, event.coordinates.latitude]),
      );
      instance.fitBounds(bounds, { padding: 56, maxZoom: 6, duration: 800 });
      fittedEventSet.current = eventSet;
    }
  }, [events, mainshockCandidateEventId, selectedEventId, seriesMemberIds]);

  return (
    <div
      ref={container}
      className="event-map"
      role="img"
      aria-label={`Interactive map showing ${events.length} earthquake events`}
    />
  );
}
