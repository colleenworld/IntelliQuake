import { describe, expect, it } from 'vitest';

import type { Queryable } from '../src/database.provider';
import { FreshnessService } from '../src/freshness.service';

describe('FreshnessService', () => {
  it('reports that no ingestion has completed', async () => {
    const database: Queryable = {
      query: async () => Promise.resolve({ rows: [], rowCount: 0 }),
    };

    await expect(new FreshnessService(database).getFreshness()).resolves.toMatchObject({
      status: 'never_ingested',
      latestRunId: null,
    });
  });

  it('reports counts and detects delayed ingestion', async () => {
    const database: Queryable = {
      query: async <T extends Record<string, unknown>>() =>
        Promise.resolve({
          rowCount: 1,
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              completed_at: new Date('2026-09-14T12:00:00.000Z'),
              source_watermark: new Date('2026-09-14T11:59:00.000Z'),
              fetched_count: 10,
              queued_count: 10,
              failed_count: 0,
              processed_count: 10,
              created_count: 8,
              revised_count: 1,
              unchanged_count: 1,
            } as unknown as T,
          ],
        }),
    };

    const result = await new FreshnessService(database).getFreshness(
      new Date('2026-09-14T12:20:00.000Z'),
    );

    expect(result.status).toBe('delayed');
    expect(result.ageSeconds).toBe(1200);
    expect(result.counts).toEqual({
      fetched: 10,
      queued: 10,
      failed: 0,
      processed: 10,
      created: 8,
      revised: 1,
      unchanged: 1,
    });
  });
});
