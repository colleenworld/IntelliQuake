import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Queryable } from '../src/database.provider';
import { EventsService } from '../src/events.service';

const eventRow = {
  id: '00000000-0000-4000-8000-000000000001',
  origin_time: new Date('2026-09-14T12:00:00.000Z'),
  latitude: '-41.25',
  longitude: '174.75',
  depth_km: '18.2',
  magnitude: '4.7',
  magnitude_type: 'mww',
  place: 'Cook Strait, New Zealand',
  source: 'usgs',
  source_event_id: 'us7000test',
};

describe('EventsService', () => {
  it('returns a validated, cursor-paginated event page', async () => {
    const query = vi.fn(async () => ({
      rows: [eventRow, { ...eventRow, id: '00000000-0000-4000-8000-000000000002' }],
      rowCount: 2,
    }));
    const service = new EventsService({ query } as unknown as Queryable);

    const result = await service.search({ minimumMagnitude: '4', limit: '1' });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      magnitude: 4.7,
      coordinates: { latitude: -41.25, longitude: 174.75, depthKm: 18.2 },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ce.preferred_magnitude >='),
      [4, 2],
    );
  });

  it('rejects inconsistent map bounds before querying', async () => {
    const query = vi.fn();
    const service = new EventsService({ query } as unknown as Queryable);

    await expect(service.search({ south: '-40' })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a cursor whose event ID is not a UUID', async () => {
    const query = vi.fn();
    const service = new EventsService({ query } as unknown as Queryable);
    const cursor = Buffer.from(
      JSON.stringify({ originTime: '2026-09-14T12:00:00.000Z', id: 'not-an-event-id' }),
    ).toString('base64url');

    await expect(service.search({ cursor })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('composes candidate-series membership with event filters', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = new EventsService({ query } as unknown as Queryable);
    const seriesId = '00000000-0000-4000-8000-000000000201';

    await service.search({ seriesId });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('series_memberships'), [
      seriesId,
      101,
    ]);
  });

  it('reports a missing event', async () => {
    const database: Queryable = {
      query: async () => Promise.resolve({ rows: [], rowCount: 0 }),
    };

    await expect(
      new EventsService(database).findById('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
