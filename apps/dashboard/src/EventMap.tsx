import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Play, Pause, Maximize, Minimize } from 'lucide-react';

maplibregl.setWorkerUrl(workerUrl);

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface MapCoordinate {
  latitude: number;
  longitude: number;
  depthKm?: number;
}

interface MapEvent {
  id: string;
  coordinates: MapCoordinate;
  magnitude: number | null;
  place: string | null;
}

interface EventMapProps {
  events: readonly MapEvent[];
  selectedEventId: string | null;
  seriesMemberIds: readonly string[];
  mainshockCandidateEventId: string | null;
  selectedSeriesId?: string | null;
  seriesCoordinates?: readonly MapCoordinate[];
  isPlaying: boolean;
  canPlay: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSelect: (id: string) => void;
  onDegraded: (message: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  replayActive: boolean;
  replayPosition: number;
  replayDuration: number;
  replaySpeed: number;
  replayTime: string | null;
  replayGeneration: number;
  totalEvents: number;
  onSeek: (position: number) => void;
  onSpeedChange: (speed: number) => void;
  onRestart: () => void;
  onFinish: () => void;
}

const EMPTY_COORDINATES: readonly MapCoordinate[] = [];

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
        depth: event.coordinates.depthKm ?? -1,
      },
    })),
  };
}

export function EventMap({
  events,
  selectedEventId,
  seriesMemberIds,
  mainshockCandidateEventId,
  selectedSeriesId = null,
  seriesCoordinates = EMPTY_COORDINATES,
  isPlaying,
  canPlay,
  onPlay,
  onPause,
  onSelect,
  onDegraded,
  onBoundsChange,
  replayActive,
  replayPosition,
  replayDuration,
  replaySpeed,
  replayTime,
  replayGeneration,
  totalEvents,
  onSeek,
  onSpeedChange,
  onRestart,
  onFinish,
}: EventMapProps) {
  const fullscreenContainer = useRef<HTMLDivElement>(null);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const previousVisible = useRef(new Set<string>());
  const previousGeneration = useRef(replayGeneration);
  const wasReplaying = useRef(false);
  const appliedDataKey = useRef('');
  const activePulses = useRef(new Map<string, { event: MapEvent; started: number }>());

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  const selectHandler = useRef(onSelect);
  const degradedHandler = useRef(onDegraded);
  const boundsHandler = useRef(onBoundsChange);

  const currentData = useRef(
    eventData(events, seriesMemberIds, mainshockCandidateEventId, selectedEventId),
  );

  const currentSeries = useRef({
    selectedSeriesId,
    seriesCoordinates,
  });

  const fittedSeriesId = useRef<string | null>(null);
  const fitSelectedSeries = useRef<(instance: MapLibreMap) => void>(() => {});

  selectHandler.current = onSelect;
  degradedHandler.current = onDegraded;
  boundsHandler.current = onBoundsChange;

  currentData.current = eventData(
    events,
    seriesMemberIds,
    mainshockCandidateEventId,
    selectedEventId,
  );

  currentSeries.current = {
    selectedSeriesId,
    seriesCoordinates,
  };

  fitSelectedSeries.current = (instance) => {
    const { selectedSeriesId: id, seriesCoordinates: coordinates } = currentSeries.current;

    if (!id) {
      fittedSeriesId.current = null;
      return;
    }

    if (fittedSeriesId.current === id || coordinates.length === 0) {
      return;
    }

    const validCoordinates = coordinates.filter(
      ({ latitude, longitude }) =>
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180,
    );

    if (validCoordinates.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();

    for (const { latitude, longitude } of validCoordinates) {
      bounds.extend([
        Math.max(-179.99, Math.min(179.99, longitude)),
        Math.max(-85, Math.min(85, latitude)),
      ]);
    }

    fittedSeriesId.current = id;

    instance.fitBounds(bounds, {
      padding: 56,
      maxZoom: 8,
      duration: 800,
    });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenContainer.current);
      setFullscreenError(null);
      map.current?.resize();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const enterFullscreen = async () => {
    const element = fullscreenContainer.current;
    if (!element) return;

    setFullscreenError(null);

    try {
      if (!element.requestFullscreen) {
        throw new Error('Fullscreen is unavailable in this browser.');
      }

      await element.requestFullscreen();
    } catch (error) {
      setFullscreenError(error instanceof Error ? error.message : 'Unable to enter fullscreen.');
    }
  };

  const exitFullscreen = async () => {
    setFullscreenError(null);

    try {
      if (document.fullscreenElement === fullscreenContainer.current) {
        await document.exitFullscreen();
      }
    } catch (error) {
      setFullscreenError(error instanceof Error ? error.message : 'Unable to exit fullscreen.');
    }
  };

  useEffect(() => {
    const element = canvasContainer.current;
    if (!element) return;

    let instance: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | undefined;
    let boundsTimer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    let lastBounds = '';

    fittedSeriesId.current = null;

    try {
      instance = new maplibregl.Map({
        container: element,
        style:
          import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron',
        center: [0, 15],
        zoom: 1.2,
        minZoom: 1.2,
        renderWorldCopies: false,
        maxBounds: [
          [-179.99, -85],
          [179.99, 85],
        ],
        attributionControl: false,
      });

      map.current = instance;
      const activeMap = instance;

      const reportBounds = () => {
        if (!ready || activeMap.isMoving()) return;

        const bounds = activeMap.getBounds();

        const viewport: MapBounds = {
          south: Math.max(-85, bounds.getSouth()),
          west: Math.max(-180, bounds.getWest()),
          north: Math.min(85, bounds.getNorth()),
          east: Math.min(180, bounds.getEast()),
        };

        if (viewport.south >= viewport.north || viewport.west >= viewport.east) {
          return;
        }

        const key = JSON.stringify(viewport);
        if (key === lastBounds) return;

        lastBounds = key;
        boundsHandler.current(viewport);
      };

      const scheduleBoundsUpdate = () => {
        if (boundsTimer !== undefined) {
          clearTimeout(boundsTimer);
        }

        boundsTimer = setTimeout(reportBounds, 200);
      };

      activeMap.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
        }),
        'top-right',
      );

      activeMap.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        }),
        'bottom-right',
      );

      activeMap.on('load', () => {
        activeMap.addSource('events', {
          type: 'geojson',
          data: currentData.current,
        });

        activeMap.addLayer({
          id: 'event-halos',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-radius': ['+', 6, ['*', 1.7, ['max', 0, ['get', 'magnitude']]]],
            'circle-color': '#334155',
            'circle-opacity': 0.15,
          },
        });

        activeMap.addLayer({
          id: 'events',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-radius': ['+', 3, ['*', 1.25, ['max', 0, ['get', 'magnitude']]]],
            'circle-color': [
              'case',
              ['<', ['get', 'depth'], 0],
              '#64748b',
              [
                'step',
                ['get', 'depth'],
                '#b91c1c',
                10,
                '#c2410c',
                30,
                '#a16207',
                70,
                '#15803d',
                150,
                '#0369a1',
                300,
                '#6d28d9',
              ],
            ],
            'circle-opacity': 0.75,
            'circle-stroke-color': [
              'case',
              ['get', 'selected'],
              '#111827',
              ['get', 'mainshockCandidate'],
              '#be185d',
              ['get', 'seriesMember'],
              '#6d28d9',
              '#ffffff',
            ],
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

        activeMap.addSource('recent-events', {
          type: 'geojson',
          data: eventData([], [], null, null),
        });
        activeMap.addLayer({
          id: 'event-pulse',
          type: 'circle',
          source: 'recent-events',
          paint: {
            'circle-radius': ['coalesce', ['get', 'pulseRadius'], 0],
            'circle-opacity': 0,
            'circle-stroke-color': '#0f766e',
            'circle-stroke-width': 2,
            'circle-stroke-opacity': ['coalesce', ['get', 'pulseOpacity'], 0],
            'circle-radius-transition': { duration: 0 },
            'circle-stroke-opacity-transition': { duration: 0 },
          },
        });

        activeMap.on('click', 'events', (event: MapLayerMouseEvent) => {
          const id: unknown = event.features?.[0]?.properties?.id;

          if (typeof id === 'string') {
            selectHandler.current(id);
          }
        });

        activeMap.on('mouseenter', 'events', () => {
          activeMap.getCanvas().style.cursor = 'pointer';
        });

        activeMap.on('mouseleave', 'events', () => {
          activeMap.getCanvas().style.cursor = '';
        });

        ready = true;
        fitSelectedSeries.current(activeMap);
        scheduleBoundsUpdate();
      });

      activeMap.on('moveend', scheduleBoundsUpdate);

      activeMap.on('error', () => {
        degradedHandler.current(
          'The map could not load some resources; event data remains accessible in the timeline.',
        );
      });

      resizeObserver = new ResizeObserver(() => {
        activeMap.resize();
        scheduleBoundsUpdate();
      });

      resizeObserver.observe(element);
    } catch (error) {
      console.error('Map initialization failed:', error);

      degradedHandler.current(
        `Map initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return () => {
      ready = false;

      if (boundsTimer !== undefined) {
        clearTimeout(boundsTimer);
      }

      resizeObserver?.disconnect();

      if (map.current === instance) {
        map.current = null;
      }

      instance?.remove();
    };
  }, []);

  useEffect(() => {
    const source = map.current?.getSource('events') as GeoJSONSource | undefined;
    if (!source) return;
    const key = JSON.stringify([
      events.map((event) => [event.id, event.coordinates, event.magnitude, event.place]),
      selectedEventId,
      seriesMemberIds,
      mainshockCandidateEventId,
    ]);
    if (key === appliedDataKey.current) return;
    appliedDataKey.current = key;
    source.setData(currentData.current);
  }, [events, seriesMemberIds, mainshockCandidateEventId, selectedEventId]);

  useEffect(() => {
    if (!selectedSeriesId) {
      fittedSeriesId.current = null;
      return;
    }

    const instance = map.current;

    if (instance?.getSource('events')) {
      fitSelectedSeries.current(instance);
    }
  }, [selectedSeriesId, seriesCoordinates]);

  const visibleIds = events.map((event) => event.id).join(',');
  const pulseEvents = useRef(events);
  pulseEvents.current = events;

  useEffect(() => {
    const activeMap = map.current;
    const current = pulseEvents.current;
    const generationChanged = previousGeneration.current !== replayGeneration;
    const enteringReplay = replayActive && !wasReplaying.current;
    const added = current.filter((event) => !previousVisible.current.has(event.id));

    previousVisible.current = new Set(current.map((event) => event.id));
    previousGeneration.current = replayGeneration;
    wasReplaying.current = replayActive;

    if (!activeMap?.getLayer('event-pulse')) return;
    if (
      !replayActive ||
      (generationChanged && !enteringReplay) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      activePulses.current.clear();
      (activeMap.getSource('recent-events') as GeoJSONSource).setData(
        eventData([], [], null, null),
      );
      return;
    }

    const arrivals = enteringReplay ? current.slice(-20) : added.slice(-20);
    const source = activeMap.getSource('recent-events') as GeoJSONSource;
    const started = performance.now();
    for (const event of arrivals) activePulses.current.set(event.id, { event, started });
    while (activePulses.current.size > 64) {
      const first = activePulses.current.keys().next().value;
      if (first === undefined) break;
      activePulses.current.delete(first);
    }
    let frame = 0;
    let lastUpdate = -Infinity;
    const animate = (now: number) => {
      if (!activeMap.getLayer('event-pulse')) return;
      if (now - lastUpdate >= 40) {
        for (const [id, pulse] of activePulses.current) {
          if (now - pulse.started >= 900) activePulses.current.delete(id);
        }
        const data = eventData(
          [...activePulses.current.values()].map((pulse) => pulse.event),
          [],
          null,
          null,
        );
        source.setData({
          ...data,
          features: data.features.map((feature) => {
            const pulse = activePulses.current.get(feature.properties.id)!;
            const progress = Math.min(1, (now - pulse.started) / 900);
            return {
              ...feature,
              properties: {
                ...feature.properties,
                pulseRadius: 8 + progress * 32,
                pulseOpacity: (1 - progress) * 0.8,
              },
            };
          }),
        });
        lastUpdate = now;
      }
      if (activePulses.current.size > 0) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visibleIds, replayGeneration, replayActive]);

  return (
    <div ref={fullscreenContainer} className="event-map">
      <div
        ref={canvasContainer}
        style={{ position: 'absolute', inset: 0 }}
        role="region"
        aria-label={`Interactive map showing ${events.length} earthquake events`}
      />

      <div
        className="map-playback-controls"
        role="group"
        aria-label="Map playback and fullscreen controls"
      >
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || !canPlay}
          aria-label="Play animation"
          title="Play animation"
        >
          <Play size={22} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onPause}
          disabled={!isPlaying}
          aria-label="Pause animation"
          title="Pause animation"
        >
          <Pause size={22} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => void enterFullscreen()}
          disabled={isFullscreen}
          aria-label="Enter fullscreen"
          title="Enter fullscreen"
        >
          <Maximize size={22} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => void exitFullscreen()}
          disabled={!isFullscreen}
          aria-label="Exit fullscreen"
          title="Exit fullscreen"
        >
          <Minimize size={22} aria-hidden="true" />
        </button>
      </div>
      <section className="map-replay-panel" aria-label="Earthquake replay">
        <div className="map-replay-heading">
          <time dateTime={replayTime ?? undefined}>
            {replayTime ? new Date(replayTime).toLocaleString() : 'No events'}
          </time>
          <span>
            {events.length.toLocaleString()} / {totalEvents.toLocaleString()} events
          </span>
        </div>
        <label className="map-replay-scrubber">
          <span className="replay-sr-only">Replay position</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, replayDuration)}
            step={1}
            value={replayActive ? replayPosition : replayDuration}
            disabled={!canPlay || replayDuration === 0}
            aria-valuetext={`${events.length} of ${totalEvents} events`}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </label>
        <div className="map-replay-options">
          <button type="button" onClick={onRestart} disabled={!canPlay}>
            Restart
          </button>
          <button type="button" onClick={onFinish} disabled={!canPlay}>
            Go to end
          </button>
          <label>
            Speed{' '}
            <select
              value={replaySpeed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
            >
              {[0.25, 0.5, 1, 2, 4, 8].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </label>
          <small>Compressed time · pauses on pan or zoom</small>
        </div>
        <div className="map-depth-legend" aria-label="Earthquake depth in kilometres">
          <span>Depth:</span>
          {[
            ['#b91c1c', '<10'],
            ['#c2410c', '10–30'],
            ['#a16207', '30–70'],
            ['#15803d', '70–150'],
            ['#0369a1', '150–300'],
            ['#6d28d9', '300+'],
            ['#64748b', 'Unknown'],
          ].map(([color, label]) => (
            <span key={label}>
              <i style={{ background: color }} />
              {label}
            </span>
          ))}
          <span>km · size = magnitude</span>
        </div>
      </section>
      {fullscreenError && (
        <p className="map-control-error" role="alert">
          {fullscreenError}
        </p>
      )}
    </div>
  );
}
