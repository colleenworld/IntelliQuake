import { applySnapshot, flow, types, type Instance, type SnapshotIn } from 'mobx-state-tree';
import type { MapBounds } from './EventMap';
import { buildReplay, revealedCount, replayClock } from './replay';

import type {
  ClassificationRun,
  EventDetail,
  EventSummary,
  SeriesDetail,
  SeriesSummary,
} from '@earthquake/domain';
import type { ChatCitation, ChatStreamEvent } from '@earthquake/contracts';

import {
  fetchEventDetail,
  fetchEventPage,
  fetchSeriesDetail,
  fetchSeriesPage,
  type EventDetailFetcher,
  type EventPageFetcher,
  type SeriesDetailFetcher,
  type SeriesPageFetcher,
  streamChat,
  type ChatEventFetcher,
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

export const ChatMessageModel = types.model('ChatMessage', {
  id: types.identifier,
  role: types.enumeration(['user', 'assistant']),
  content: types.string,
  citations: types.array(types.frozen<ChatCitation>()),
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
    series: types.array(types.frozen<SeriesSummary>()),
    selectedSeriesId: types.maybeNull(types.string),
    selectedSeriesDetail: types.maybeNull(types.frozen<SeriesDetail>()),
    classificationRun: types.maybeNull(types.frozen<ClassificationRun>()),
    seriesStatus: types.optional(types.enumeration(['idle', 'loading', 'ready', 'error']), 'idle'),
    seriesErrorMessage: types.maybeNull(types.string),
    nextCursor: types.maybeNull(types.string),
    status: types.optional(
      types.enumeration(['idle', 'loading', 'ready', 'degraded', 'error']),
      'idle',
    ),
    errorMessage: types.maybeNull(types.string),
    mapMessage: types.maybeNull(types.string),
    isPlaying: types.optional(types.boolean, false),
    replayActive: types.optional(types.boolean, false),
    replayPosition: types.optional(types.number, 0),
    replaySpeed: types.optional(types.number, 1),
    replayGeneration: types.optional(types.number, 0),
    lastUpdatedAt: types.maybeNull(types.string),
    chatDraft: types.optional(types.string, ''),
    chatMessages: types.array(ChatMessageModel),
    chatStatus: types.optional(
      types.enumeration(['idle', 'thinking', 'tool', 'streaming', 'error']),
      'idle',
    ),
    chatTool: types.maybeNull(types.string),
    chatErrorMessage: types.maybeNull(types.string),
    mapBounds: types.maybeNull(types.frozen<MapBounds>()),
  })
  .views((self) => ({
    get replaySchedule() {
      return buildReplay<Instance<typeof EventModel>>([...self.events]);
    },
    get selectedEvent(): Instance<typeof EventModel> | undefined {
      return self.events.find((event) => event.id === self.selectedEventId);
    },
    get selectedSeries(): SeriesSummary | undefined {
      return self.series.find((series) => series.id === self.selectedSeriesId);
    },
    /*get selectedSeriesMemberIds(): string[] {
      return self.selectedSeriesDetail?.memberships.map((membership) => membership.event.id) ?? [];
    },*/
    get urlSearch(): string {
      const params = new URLSearchParams();
      if (self.minimumMagnitude !== 2.5) params.set('minMagnitude', String(self.minimumMagnitude));
      if (self.maximumMagnitude !== null) params.set('maxMagnitude', String(self.maximumMagnitude));
      if (self.startTime) params.set('start', self.startTime);
      if (self.endTime) params.set('end', self.endTime);
      if (self.selectedEventId) params.set('event', self.selectedEventId);
      if (self.selectedSeriesId) params.set('series', self.selectedSeriesId);
      const value = params.toString();
      return value ? `?${value}` : '';
    },
  }))
  .views((self) => ({
    get replayDuration(): number {
      return self.replaySchedule.at(-1)?.at ?? 0;
    },
    get replayEvents() {
      const entries = self.replaySchedule;
      const count = self.replayActive
        ? revealedCount(entries, self.replayPosition)
        : entries.length;
      return entries.slice(0, count).map((entry) => entry.event);
    },
    get replayTime(): string | null {
      return self.replayActive
        ? replayClock(self.replaySchedule, self.replayPosition)
        : (self.replaySchedule.at(-1)?.event.originTime ?? null);
    },
  }))
  .actions((self) => {
    let eventRequestVersion = 0;
    const loadEvents = flow(function* loadEvents(
      fetcher: EventPageFetcher = fetchEventPage,
    ): Generator<Promise<EventSearchResult>, void, EventSearchResult> {
      const requestVersion = ++eventRequestVersion;
      const previousCount = self.events.length;

      const query = {
        minimumMagnitude: self.minimumMagnitude,
        maximumMagnitude: self.maximumMagnitude ?? undefined,
        startTime: optionalIso(self.startTime),
        endTime: optionalIso(self.endTime),
        seriesId: self.selectedSeriesId ?? undefined,
        ...(self.mapBounds ?? {}),
        limit: 500,
      };

      self.status = 'loading';
      self.errorMessage = null;
      self.isPlaying = false;

      try {
        const snapshots: SnapshotIn<typeof EventModel>[] = [];
        const seenIds = new Set<string>();
        const seenCursors = new Set<string>();
        let cursor: string | undefined;

        while (true) {
          const response = yield fetcher({ ...query, cursor });

          // A newer viewport or filter query has superseded this request.
          if (requestVersion !== eventRequestVersion) return;

          for (const event of response.events) {
            if (seenIds.has(event.id)) continue;
            seenIds.add(event.id);
            snapshots.push({
              id: event.id,
              originTime: event.originTime,
              coordinates: event.coordinates,
              magnitude: event.magnitude,
              magnitudeType: event.magnitudeType,
              place: event.place,
              source: event.source,
              sourceEventId: event.sourceEventId,
            });
          }

          cursor = response.nextCursor ?? undefined;

          if (!cursor || snapshots.length >= 5000) break;

          if (seenCursors.has(cursor)) {
            throw new Error('The event API returned a repeated pagination cursor');
          }
          seenCursors.add(cursor);
        }

        applySnapshot(self.events, snapshots);
        self.replayActive = false;
        self.replayPosition = 0;
        self.replayGeneration += 1;
        self.nextCursor = cursor ?? null;

        if (
          self.selectedEventId &&
          !self.events.some((event) => event.id === self.selectedEventId)
        ) {
          self.selectedEventId = null;
          self.selectedEventDetail = null;
        }

        self.lastUpdatedAt = new Date().toISOString();
        self.status = 'ready';
      } catch (error) {
        if (requestVersion !== eventRequestVersion) return;
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

    const loadSeries = flow(function* loadSeries(
      fetcher: SeriesPageFetcher = fetchSeriesPage,
    ): Generator<Promise<SeriesSearchResult>, void, SeriesSearchResult> {
      self.seriesStatus = 'loading';
      self.seriesErrorMessage = null;
      try {
        const response = yield fetcher({ limit: 25 });
        applySnapshot(self.series, response.series);
        self.classificationRun = response.classificationRun;
        self.seriesStatus = 'ready';
      } catch (error) {
        self.seriesStatus = 'error';
        self.seriesErrorMessage =
          error instanceof Error ? error.message : 'Unable to load candidate series';
      }
    });

    const loadSelectedSeries = flow(function* loadSelectedSeries(
      fetcher: SeriesDetailFetcher = fetchSeriesDetail,
    ): Generator<Promise<SeriesDetailResult>, void, SeriesDetailResult> {
      if (!self.selectedSeriesId) {
        self.selectedSeriesDetail = null;
        return;
      }
      try {
        const response = yield fetcher(self.selectedSeriesId);
        if (response.series.id === self.selectedSeriesId) {
          self.selectedSeriesDetail = response.series;
        }
      } catch (error) {
        self.selectedSeriesDetail = null;
        self.seriesErrorMessage =
          error instanceof Error ? error.message : 'Unable to load candidate series details';
      }
    });

    const sendChat = flow(function* sendChat(
      fetcher: ChatEventFetcher = streamChat,
    ): Generator<Promise<IteratorResult<ChatStreamEvent>>, void, IteratorResult<ChatStreamEvent>> {
      const message = self.chatDraft.trim();
      if (
        !message ||
        self.chatStatus === 'thinking' ||
        self.chatStatus === 'tool' ||
        self.chatStatus === 'streaming'
      )
        return;
      const history = self.chatMessages.slice(-12).map((item) => ({
        role: item.role as 'user' | 'assistant',
        content: item.content,
      }));
      self.chatMessages.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        citations: [],
      });
      const assistantId = crypto.randomUUID();
      self.chatMessages.push({ id: assistantId, role: 'assistant', content: '', citations: [] });
      self.chatDraft = '';
      self.chatStatus = 'thinking';
      self.chatErrorMessage = null;
      const iterator = fetcher({
        message,
        history,
        context: {
          selectedEventId: self.selectedEventId ?? undefined,
          selectedSeriesId: self.selectedSeriesId ?? undefined,
        },
      });
      try {
        while (true) {
          const next = yield iterator.next();
          if (next.done) break;
          const event = next.value;
          const assistant = self.chatMessages.find((item) => item.id === assistantId)!;
          if (event.type === 'status') {
            self.chatStatus = event.phase;
            self.chatTool = event.tool ?? null;
          } else if (event.type === 'delta') {
            self.chatStatus = 'streaming';
            assistant.content += event.text;
          } else if (event.type === 'citation') {
            assistant.citations.push(event.citation);
          } else if (event.type === 'error') {
            throw new Error(event.message);
          } else {
            self.chatStatus = 'idle';
            self.chatTool = null;
          }
        }
      } catch (error) {
        self.chatStatus = 'error';
        self.chatErrorMessage =
          error instanceof Error ? error.message : 'Unable to answer right now';
        const assistant = self.chatMessages.find((item) => item.id === assistantId);
        if (assistant && !assistant.content)
          assistant.content = 'I could not complete that request.';
      }
    });

    return {
      setMapBounds(bounds: MapBounds): boolean {
        const previous = self.mapBounds;

        if (
          previous &&
          previous.south === bounds.south &&
          previous.west === bounds.west &&
          previous.north === bounds.north &&
          previous.east === bounds.east
        ) {
          return false;
        }

        self.mapBounds = bounds;
        return true;
      },
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
      selectSeries(id: string | null): void {
        self.selectedSeriesId = id;
        self.selectedSeriesDetail = null;
        self.selectedEventId = null;
        self.selectedEventDetail = null;
      },
      togglePlayback(): void {
        if (self.isPlaying) {
          self.isPlaying = false;
          return;
        }
        if (self.status === 'loading' || self.status === 'error' || self.events.length === 0)
          return;
        if (!self.replayActive || self.replayPosition >= self.replayDuration) {
          self.replayPosition = 0;
          self.replayGeneration += 1;
        }
        self.replayActive = true;
        self.isPlaying = self.replayDuration > 0;
      },
      pausePlayback(): void {
        self.isPlaying = false;
      },
      advancePlayback(elapsedMs = 50): void {
        if (!self.isPlaying || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
        self.replayPosition = Math.min(
          self.replayDuration,
          self.replayPosition + Math.min(elapsedMs, 250) * self.replaySpeed,
        );
        if (self.replayPosition >= self.replayDuration) self.isPlaying = false;
      },
      setReplaySpeed(speed: number): void {
        if ([0.25, 0.5, 1, 2, 4, 8].includes(speed)) self.replaySpeed = speed;
      },
      seekReplay(position: number): void {
        if (!Number.isFinite(position)) return;
        self.isPlaying = false;
        self.replayActive = true;
        self.replayPosition = Math.max(0, Math.min(self.replayDuration, position));
        self.replayGeneration += 1;
      },
      restartReplay(): void {
        self.isPlaying = false;
        self.replayActive = true;
        self.replayPosition = 0;
        self.replayGeneration += 1;
      },
      finishReplay(): void {
        self.isPlaying = false;
        self.replayActive = true;
        self.replayPosition = self.replayDuration;
        self.replayGeneration += 1;
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
        self.selectedSeriesId = params.get('series');
        self.selectedEventDetail = null;
        self.selectedSeriesDetail = null;
      },
      setMapDegraded(message: string): void {
        self.mapMessage = message;
      },
      setChatDraft(value: string): void {
        self.chatDraft = value;
      },
      clearChat(): void {
        self.chatMessages.clear();
        self.chatStatus = 'idle';
        self.chatErrorMessage = null;
      },
      loadEvents,
      loadSelectedEvent,
      loadSeries,
      loadSelectedSeries,
      sendChat,
    };
  });

type EventSearchResult = Awaited<ReturnType<EventPageFetcher>>;
type EventDetailResult = Awaited<ReturnType<EventDetailFetcher>>;
type SeriesSearchResult = Awaited<ReturnType<SeriesPageFetcher>>;
type SeriesDetailResult = Awaited<ReturnType<SeriesDetailFetcher>>;

export type ExplorerStore = Instance<typeof ExplorerStoreModel>;
export const explorerStore = ExplorerStoreModel.create();
