import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Queryable } from '../src/database.provider';
import { SeriesService } from '../src/series.service';

const runRow = {
  id: '00000000-0000-4000-8000-000000000101',
  algorithm: 'deterministic-space-time',
  algorithm_version: '1.0.0',
  parameters: {
    baseTimeWindowHours: 24,
    baseDistanceKm: 60,
    magnitudeReference: 4,
    magnitudeWindowScale: 0.5,
    timeWeight: 0.4,
    distanceWeight: 0.4,
    magnitudeWeight: 0.2,
    minimumEdgeScore: 0.45,
    minimumSeriesSize: 2,
  },
  catalog_watermark: '2026-09-15T00:00:00.000Z',
  analysis_start: '2026-09-08T00:00:00.000Z',
  analysis_end: '2026-09-15T00:00:00.000Z',
  status: 'succeeded' as const,
  started_at: '2026-09-15T00:00:00.000Z',
  completed_at: '2026-09-15T00:00:01.000Z',
  input_count: 12,
  series_count: 1,
  membership_count: 3,
  failure_count: 0,
  error_summary: null,
};

const seriesRow = {
  id: '00000000-0000-4000-8000-000000000201',
  classification_run_id: runRow.id,
  mainshock_candidate_event_id: '00000000-0000-4000-8000-000000000001',
  start_time: '2026-09-14T00:00:00.000Z',
  end_time: '2026-09-14T04:00:00.000Z',
  event_count: 3,
  maximum_magnitude: '5.2',
  latitude: '-41.1',
  longitude: '174.1',
  display_name: 'Candidate series near Cook Strait',
};

describe('SeriesService', () => {
  it('lists candidate series from the latest completed run', async () => {
    const query = vi
      .fn<Queryable['query']>()
      .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [seriesRow], rowCount: 1 });
    const result = await new SeriesService({ query } as unknown as Queryable).search({
      limit: '10',
    });

    expect(result.series[0]).toMatchObject({
      displayName: 'Candidate series near Cook Strait',
      maximumMagnitude: 5.2,
      centroid: { latitude: -41.1, longitude: 174.1 },
    });
    expect(result.classificationRun?.algorithmVersion).toBe('1.0.0');
    expect(result.nextCursor).toBeNull();
  });

  it('validates search bounds before querying', async () => {
    const query = vi.fn<Queryable['query']>();
    await expect(
      new SeriesService({ query } as unknown as Queryable).search({ limit: '1000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a cursor whose series ID is not a UUID', async () => {
    const query = vi
      .fn<Queryable['query']>()
      .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
    const cursor = Buffer.from(
      JSON.stringify({ startTime: '2026-09-14T12:00:00.000Z', id: 'not-a-series-id' }),
    ).toString('base64url');

    await expect(
      new SeriesService({ query } as unknown as Queryable).search({ cursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports a missing candidate series', async () => {
    const database: Queryable = {
      query: async () => Promise.resolve({ rows: [], rowCount: 0 }),
    };
    await expect(
      new SeriesService(database).findById('00000000-0000-4000-8000-000000000201'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
