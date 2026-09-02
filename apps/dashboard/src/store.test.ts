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
});
