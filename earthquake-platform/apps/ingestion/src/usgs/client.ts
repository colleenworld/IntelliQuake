import { UsgsFeatureCollectionSchema, type UsgsFeatureCollection } from './schema';

const DEFAULT_FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/2.5_day.geojson';
const DEFAULT_QUERY_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const USGS_RESULT_LIMIT = 20_000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export interface UsgsResponse {
  data: UsgsFeatureCollection;
  rawText: string;
  requestUrl: string;
}

export interface BackfillOptions {
  startTime: Date;
  endTime: Date;
  minimumMagnitude?: number;
  partitionDays?: number;
}

export class UsgsRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UsgsRequestError';
  }
}

export class UsgsResultLimitError extends Error {
  constructor(readonly requestUrl: string) {
    super('USGS query reached the 20,000 event limit; use a smaller backfill partition');
    this.name = 'UsgsResultLimitError';
  }
}

export class UsgsClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly feedUrl = DEFAULT_FEED_URL,
    private readonly queryUrl = DEFAULT_QUERY_URL,
    private readonly sleep: Sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async fetchFeed(): Promise<UsgsResponse> {
    return this.fetchGeoJson(this.feedUrl);
  }

  async *backfill(options: BackfillOptions): AsyncGenerator<UsgsResponse> {
    const partitionDays = options.partitionDays ?? 1;
    if (partitionDays <= 0 || !Number.isInteger(partitionDays)) {
      throw new Error('partitionDays must be a positive integer');
    }
    if (options.startTime >= options.endTime) {
      throw new Error('startTime must be earlier than endTime');
    }

    const partitionMilliseconds = partitionDays * 24 * 60 * 60 * 1000;
    for (
      let partitionStart = options.startTime.getTime();
      partitionStart < options.endTime.getTime();
      partitionStart += partitionMilliseconds
    ) {
      const partitionEnd = Math.min(
        partitionStart + partitionMilliseconds,
        options.endTime.getTime(),
      );
      const url = new URL(this.queryUrl);
      url.searchParams.set('format', 'geojson');
      url.searchParams.set('eventtype', 'earthquake');
      url.searchParams.set('orderby', 'time-asc');
      url.searchParams.set('limit', String(USGS_RESULT_LIMIT));
      url.searchParams.set('starttime', new Date(partitionStart).toISOString());
      url.searchParams.set('endtime', new Date(partitionEnd).toISOString());
      if (options.minimumMagnitude !== undefined) {
        url.searchParams.set('minmagnitude', String(options.minimumMagnitude));
      }

      const response = await this.fetchGeoJson(url.toString());
      if (response.data.features.length === USGS_RESULT_LIMIT) {
        throw new UsgsResultLimitError(response.requestUrl);
      }
      yield response;
    }
  }

  private async fetchGeoJson(requestUrl: string): Promise<UsgsResponse> {
    const maximumAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(requestUrl, {
          headers: { accept: 'application/geo+json, application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < maximumAttempts) {
            const retryAfterSeconds = Number(response.headers.get('retry-after'));
            const delay = Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds * 1000
              : 250 * 2 ** (attempt - 1);
            await this.sleep(delay);
            continue;
          }
          throw new UsgsRequestError(
            `USGS request failed with HTTP ${response.status}`,
            response.status,
          );
        }

        const rawText = await response.text();
        const data: unknown = JSON.parse(rawText);
        return {
          data: UsgsFeatureCollectionSchema.parse(data),
          rawText,
          requestUrl,
        };
      } catch (error) {
        lastError = error;
        if (error instanceof UsgsRequestError || attempt === maximumAttempts) {
          throw error;
        }
        await this.sleep(250 * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }
}
