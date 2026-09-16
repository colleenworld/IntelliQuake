import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { Queryable } from '../src/database.provider';
import type { EventsService } from '../src/events.service';
import type { SeriesService } from '../src/series.service';
import { CatalogChatTools } from '../src/chat/chat-tools';

describe('CatalogChatTools', () => {
  it('rejects invalid nearby coordinates before querying', async () => {
    const query = vi.fn();
    const tools = new CatalogChatTools(
      { query } as unknown as Queryable,
      {} as EventsService,
      {} as SeriesService,
    );

    await expect(
      tools.execute('get_nearby_events', { latitude: 100, longitude: 174, radiusKm: 20 }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(query).not.toHaveBeenCalled();
  });

  it('bounds largest-event results and emits navigable record citations', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          origin_time: '2026-09-14T12:00:00.000Z',
          latitude: '-41.25',
          longitude: '174.75',
          depth_km: '18.2',
          magnitude: '7.1',
          magnitude_type: 'mww',
          place: 'Cook Strait, New Zealand',
          source: 'usgs',
          source_event_id: 'us7000test',
        },
      ],
      rowCount: 1,
    }));
    const tools = new CatalogChatTools(
      { query } as unknown as Queryable,
      {} as EventsService,
      {} as SeriesService,
    );

    const result = await tools.execute('get_largest_events', { limit: 1 });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1::integer'), [1]);
    expect(result.citations[0]).toMatchObject({
      kind: 'event',
      href: '/?event=00000000-0000-4000-8000-000000000001',
    });
    expect(result.resultCount).toBe(1);
  });
});
