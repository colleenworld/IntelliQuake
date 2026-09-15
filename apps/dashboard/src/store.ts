import { applySnapshot, flow, types, type Instance, type SnapshotIn } from 'mobx-state-tree';

import type { EventDetail, EventSummary } from '@earthquake/domain';

import {
  fetchEventDetail,
  fetchEventPage,
  type EventDetailFetcher,
  type EventPageFetcher,
} from './api';

export const EventModel = types.model('Event', {
  id: types.identifier,
  originTime: types.string,
  coordinates: types.frozen<EventSummary['coordinates']>(),
  magnitude: types.maybeNull(types.number),
  magnitudeType: types.maybeNull(types.string),
  place: types.maybeNull(types.string),
  source: types.string,
  sourceEventId: types.string,
});

function optionalIso(value: string): string | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

export const ExplorerStoreModel = types
  .model('ExplorerStore', {
    minimumMagnitude: types.optional(types.number, 2.5),
    maximumMagnitude: types.maybeNull(types.number),
    startTime: types.optional(types.string, ''),
    endTime: types.optional(types.string, ''),
    events: types.array(EventModel),
    selectedEventId: types.maybeNull(types.string),
    selectedEventDetail: types.maybeNull(types.frozen<EventDetail>()),
    nextCursor: types.maybeNull(types.string),
    status: types.optional(
      types.enumeration(['idle', 'loading', 'ready', 'degraded', 'error']),
      'idle',
    ),
    errorMessage: types.maybeNull(types.string),
    mapMessage: types.maybeNull(types.string),
    isPlaying: types.optional(types.boolean, false),
    lastUpdatedAt: types.maybeNull(types.string),
  })
  .views((self) => ({
    get selectedEvent(): Instance<typeof EventModel> | undefined {
      return self.events.find((event) => event.id === self.selectedEventId);
    },
    get urlSearch(): string {
      const params = new URLSearchParams();
      if (self.minimumMagnitude !== 2.5) params.set('minMagnitude', String(self.minimumMagnitude));
      if (self.maximumMagnitude !== null) params.set('maxMagnitude', String(self.maximumMagnitude));
      if (self.startTime) params.set('start', self.startTime);
      if (self.endTime) params.set('end', self.endTime);
      if (self.selectedEventId) params.set('event', self.selectedEventId);
      const value = params.toString();
      return value ? `?${value}` : '';
    },
  }))
  .actions((self) => {
    const loadEvents = flow(function* loadEvents(
      fetcher: EventPageFetcher = fetchEventPage,
    ): Generator<Promise<EventSearchResult>, void, EventSearchResult> {
      const previousCount = self.events.length;
      self.status = 'loading';
      self.errorMessage = null;
      try {
        const response = yield fetcher({
          minimumMagnitude: self.minimumMagnitude,
          maximumMagnitude: self.maximumMagnitude ?? undefined,
          startTime: optionalIso(self.startTime),
          endTime: optionalIso(self.endTime),
          limit: 250,
        });
        const snapshots: SnapshotIn<typeof EventModel>[] = response.events.map((event) => ({
          id: event.id,
          originTime: event.originTime,
          coordinates: event.coordinates,
          magnitude: event.magnitude,
          magnitudeType: event.magnitudeType,
          place: event.place,
          source: event.source,
          sourceEventId: event.sourceEventId,
        }));
        applySnapshot(self.events, snapshots);
        self.nextCursor = response.nextCursor;
        self.lastUpdatedAt = new Date().toISOString();
        self.status = 'ready';
      } catch (error) {
        self.status = previousCount > 0 ? 'degraded' : 'error';
        self.errorMessage = error instanceof Error ? error.message : 'Unable to load events';
      }
    });

    const loadSelectedEvent = flow(function* loadSelectedEvent(
      fetcher: EventDetailFetcher = fetchEventDetail,
    ): Generator<Promise<EventDetailResult>, void, EventDetailResult> {
      if (!self.selectedEventId) {
        self.selectedEventDetail = null;
        return;
      }
      try {
        const response = yield fetcher(self.selectedEventId);
        if (response.event.id === self.selectedEventId) self.selectedEventDetail = response.event;
      } catch {
        self.selectedEventDetail = null;
      }
    });

    return {
      setMinimumMagnitude(value: number): void {
        self.minimumMagnitude = value;
      },
      setMaximumMagnitude(value: number | null): void {
        self.maximumMagnitude = value;
      },
      setStartTime(value: string): void {
        self.startTime = value;
      },
      setEndTime(value: string): void {
        self.endTime = value;
      },
      selectEvent(id: string | null): void {
        self.selectedEventId = id;
        self.selectedEventDetail = null;
      },
      togglePlayback(): void {
        self.isPlaying = !self.isPlaying;
      },
      pausePlayback(): void {
        self.isPlaying = false;
      },
      advancePlayback(): void {
        if (self.events.length === 0) return;
        const chronological = [...self.events].reverse();
        const index = chronological.findIndex((event) => event.id === self.selectedEventId);
        self.selectedEventId = chronological[(index + 1) % chronological.length]!.id;
        self.selectedEventDetail = null;
      },
      applyUrl(search: string): void {
        const params = new URLSearchParams(search);
        const minimum = Number(params.get('minMagnitude'));
        const maximum = Number(params.get('maxMagnitude'));
        self.minimumMagnitude =
          params.has('minMagnitude') && Number.isFinite(minimum) ? minimum : 2.5;
        self.maximumMagnitude =
          params.has('maxMagnitude') && Number.isFinite(maximum) ? maximum : null;
        self.startTime = params.get('start') ?? '';
        self.endTime = params.get('end') ?? '';
        self.selectedEventId = params.get('event');
        self.selectedEventDetail = null;
      },
      setMapDegraded(message: string): void {
        self.mapMessage = message;
      },
      loadEvents,
      loadSelectedEvent,
    };
  });

type EventSearchResult = Awaited<ReturnType<EventPageFetcher>>;
type EventDetailResult = Awaited<ReturnType<EventDetailFetcher>>;

export type ExplorerStore = Instance<typeof ExplorerStoreModel>;
export const explorerStore = ExplorerStoreModel.create();
