import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_CLASSIFIER_PARAMETERS } from '@earthquake/classification';
import type { Logger } from '@earthquake/observability';

import type {
  ClassificationCatalog,
  ClassificationRunRepository,
} from '../src/classification/ports';
import { CandidateSeriesService } from '../src/classification/service';

describe('CandidateSeriesService', () => {
  it('records a reproducible watermark and completed run', async () => {
    const start = vi.fn<ClassificationRunRepository['start']>();
    const complete = vi.fn<ClassificationRunRepository['complete']>();
    const catalog: ClassificationCatalog = { readSnapshot: vi.fn(async () => []) };
    const runs: ClassificationRunRepository = {
      start,
      complete,
      fail: vi.fn(),
    };
    const logger: Logger = { info: vi.fn(), error: vi.fn() };
    const service = new CandidateSeriesService(
      catalog,
      runs,
      { now: () => new Date('2026-09-15T00:00:00.000Z') },
      { generate: () => '00000000-0000-4000-8000-000000000001' },
      logger,
    );

    const result = await service.run({
      analysisStart: '2026-09-08T00:00:00.000Z',
      analysisEnd: '2026-09-15T00:00:00.000Z',
      parameters: DEFAULT_CLASSIFIER_PARAMETERS,
    });

    expect(result.catalogWatermark).toBe('2026-09-15T00:00:00.000Z');
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        algorithmVersion: '1.0.0',
        catalogWatermark: '2026-09-15T00:00:00.000Z',
      }),
    );
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ inputCount: 0, series: [] }));
  });

  it('preserves a failed run for audit', async () => {
    const fail = vi.fn<ClassificationRunRepository['fail']>();
    const service = new CandidateSeriesService(
      { readSnapshot: async () => Promise.reject(new Error('snapshot unavailable')) },
      { start: vi.fn(), complete: vi.fn(), fail },
      { now: () => new Date('2026-09-15T00:00:00.000Z') },
      { generate: () => '00000000-0000-4000-8000-000000000001' },
      { info: vi.fn(), error: vi.fn() },
    );

    await expect(
      service.run({
        analysisStart: '2026-09-08T00:00:00.000Z',
        analysisEnd: '2026-09-15T00:00:00.000Z',
        parameters: DEFAULT_CLASSIFIER_PARAMETERS,
      }),
    ).rejects.toThrow('snapshot unavailable');
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorSummary: 'snapshot unavailable' }),
    );
  });
});
