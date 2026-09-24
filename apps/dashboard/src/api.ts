import {
  EventDetailResponseSchema,
  EventSearchResponseSchema,
  SeriesDetailResponseSchema,
  SeriesSearchResponseSchema,
  type EventDetailResponse,
  type EventSearchQuery,
  type EventSearchResponse,
  type SeriesDetailResponse,
  type SeriesSearchQuery,
  type SeriesSearchResponse,
  ChatStreamEventSchema,
  type ChatRequest,
  type ChatStreamEvent,
} from '@earthquake/contracts';

const apiUrl = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3000')
).replace(/\/$/, '');

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}/v1${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
  return response.json() as Promise<unknown>;
}

export type EventPageFetcher = (query: EventSearchQuery) => Promise<EventSearchResponse>;
export type EventDetailFetcher = (id: string) => Promise<EventDetailResponse>;
export type SeriesPageFetcher = (query: SeriesSearchQuery) => Promise<SeriesSearchResponse>;
export type SeriesDetailFetcher = (id: string) => Promise<SeriesDetailResponse>;

export const fetchEventPage: EventPageFetcher = async (query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return EventSearchResponseSchema.parse(await getJson(`/events?${params.toString()}`));
};

export const fetchEventDetail: EventDetailFetcher = async (id) =>
  EventDetailResponseSchema.parse(await getJson(`/events/${encodeURIComponent(id)}`));

export const fetchSeriesPage: SeriesPageFetcher = async (query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return SeriesSearchResponseSchema.parse(await getJson(`/series?${params.toString()}`));
};

export const fetchSeriesDetail: SeriesDetailFetcher = async (id) =>
  SeriesDetailResponseSchema.parse(await getJson(`/series/${encodeURIComponent(id)}`));

export type ChatEventFetcher = (request: ChatRequest) => AsyncGenerator<ChatStreamEvent>;

export const streamChat: ChatEventFetcher = async function* (request) {
  const response = await fetch(`${apiUrl}/v1/chat`, {
    method: 'POST',
    headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((entry) => entry.startsWith('data: '));
      if (line) yield ChatStreamEventSchema.parse(JSON.parse(line.slice(6)) as unknown);
    }
  }
};
