import {
  EventDetailResponseSchema,
  EventSearchResponseSchema,
  type EventDetailResponse,
  type EventSearchQuery,
  type EventSearchResponse,
} from '@earthquake/contracts';

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}/v1${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
  return response.json() as Promise<unknown>;
}

export type EventPageFetcher = (query: EventSearchQuery) => Promise<EventSearchResponse>;
export type EventDetailFetcher = (id: string) => Promise<EventDetailResponse>;

export const fetchEventPage: EventPageFetcher = async (query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return EventSearchResponseSchema.parse(await getJson(`/events?${params.toString()}`));
};

export const fetchEventDetail: EventDetailFetcher = async (id) =>
  EventDetailResponseSchema.parse(await getJson(`/events/${encodeURIComponent(id)}`));
