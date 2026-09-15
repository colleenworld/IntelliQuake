import { describe, expect, it, vi } from 'vitest';

import { UsgsClient } from '../src/usgs/client';
import { makeUsgsCollection } from './fixtures/usgs';

describe('UsgsClient', () => {
  it('validates a real-time GeoJSON response', async () => {
    const collection = makeUsgsCollection();
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify(collection), {
          status: 200,
          headers: { 'content-type': 'application/geo+json' },
        }),
      ),
    );
    const client = new UsgsClient(fetchImpl);

    const response = await client.fetchFeed();

    expect(response.data.features).toHaveLength(1);
    expect(response.data.features[0]?.id).toBe('us7000test');
  });

  it('partitions backfills and supplies bounded FDSN query parameters', async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL) => {
      requests.push(input.toString());
      return new Response(JSON.stringify(makeUsgsCollection([])), { status: 200 });
    });
    const client = new UsgsClient(fetchImpl);

    const responses = [];
    for await (const response of client.backfill({
      startTime: new Date('2026-09-01T00:00:00.000Z'),
      endTime: new Date('2026-09-02T12:00:00.000Z'),
      minimumMagnitude: 2.5,
      partitionDays: 1,
    })) {
      responses.push(response);
    }

    expect(responses).toHaveLength(2);
    expect(requests).toHaveLength(2);
    const first = new URL(requests[0] ?? '');
    expect(first.searchParams.get('format')).toBe('geojson');
    expect(first.searchParams.get('eventtype')).toBe('earthquake');
    expect(first.searchParams.get('limit')).toBe('20000');
    expect(first.searchParams.get('minmagnitude')).toBe('2.5');
    expect(first.searchParams.get('orderby')).toBe('time-asc');
  });

  it('retries a throttled request using Retry-After', async () => {
    const collection = makeUsgsCollection();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(collection), { status: 200 }));
    const sleep = vi.fn(async () => Promise.resolve());
    const client = new UsgsClient(fetchImpl, undefined, undefined, sleep);

    await expect(client.fetchFeed()).resolves.toMatchObject({
      data: { features: [collection.features[0]] },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });
});
