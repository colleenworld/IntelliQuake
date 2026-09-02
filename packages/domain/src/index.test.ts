import { describe, expect, it } from 'vitest';

import { CoordinatesSchema } from './index';

describe('CoordinatesSchema', () => {
  it('rejects invalid geographic coordinates', () => {
    expect(
      CoordinatesSchema.safeParse({ latitude: 91, longitude: -122.3, depthKm: 8 }).success,
    ).toBe(false);
  });
});
