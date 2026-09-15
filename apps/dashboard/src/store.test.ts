import { describe, expect, it } from 'vitest';

import { ExplorerStoreModel } from './store';

describe('ExplorerStore', () => {
  it('coordinates explorer filters and playback state', () => {
    const store = ExplorerStoreModel.create();

    store.setMinimumMagnitude(4.5);
    store.togglePlayback();

    expect(store.minimumMagnitude).toBe(4.5);
    expect(store.isPlaying).toBe(true);
  });

  it('loads a validated event page and exposes selection through a deep link', async () => {
    const store = ExplorerStoreModel.create();

    await store.loadEvents(async () => ({
      events: [
        {
          id: '00000000-0000-4000-8000-000000000001' as never,
          originTime: '2026-09-14T12:00:00.000Z',
          coordinates: { latitude: -41.25, longitude: 174.75, depthKm: 18.2 },
          magnitude: 4.7,
          magnitudeType: 'mww',
          place: 'Cook Strait, New Zealand',
          source: 'usgs',
          sourceEventId: 'us7000test',
        },
      ],
      nextCursor: null,
    }));
    store.selectEvent('00000000-0000-4000-8000-000000000001');

    expect(store.status).toBe('ready');
    expect(store.selectedEvent?.place).toBe('Cook Strait, New Zealand');
    expect(store.urlSearch).toContain('event=00000000-0000-4000-8000-000000000001');
  });

  it('uses the product default when a deep link omits minimum magnitude', () => {
    const store = ExplorerStoreModel.create({ minimumMagnitude: 6 });

    store.applyUrl('?event=00000000-0000-4000-8000-000000000001');

    expect(store.minimumMagnitude).toBe(2.5);
  });

  it('keeps existing data visible when a refresh fails', async () => {
    const store = ExplorerStoreModel.create({
      events: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          originTime: '2026-09-14T12:00:00.000Z',
          coordinates: { latitude: -41.25, longitude: 174.75, depthKm: 18.2 },
          magnitude: 4.7,
          magnitudeType: 'mww',
          place: 'Cook Strait, New Zealand',
          source: 'usgs',
          sourceEventId: 'us7000test',
        },
      ],
    });

    await store.loadEvents(async () => Promise.reject(new Error('network unavailable')));

    expect(store.status).toBe('degraded');
    expect(store.events).toHaveLength(1);
    expect(store.errorMessage).toBe('network unavailable');
  });
});
