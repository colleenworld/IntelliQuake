import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health.controller';

describe('HealthController', () => {
  it('reports that the service is healthy', () => {
    expect(new HealthController().getHealth()).toEqual({
      service: 'earthquake-api',
      status: 'ok',
    });
  });
});
