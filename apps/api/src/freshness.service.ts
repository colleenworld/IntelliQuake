import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Queryable } from './database.provider';

interface FreshnessRow extends Record<string, unknown> {
  id: string;
  completed_at: Date;
  source_watermark: Date | null;
  fetched_count: number;
  queued_count: number;
  failed_count: number;
  processed_count: number;
  created_count: number;
  revised_count: number;
  unchanged_count: number;
}

export interface CatalogFreshness {
  status: 'fresh' | 'delayed' | 'never_ingested';
  latestRunId: string | null;
  completedAt: string | null;
  sourceWatermark: string | null;
  ageSeconds: number | null;
  counts: {
    fetched: number;
    queued: number;
    failed: number;
    processed: number;
    created: number;
    revised: number;
    unchanged: number;
  } | null;
}

@Injectable()
export class FreshnessService {
  constructor(@Inject(DATABASE) private readonly database: Queryable) {}

  async getFreshness(now = new Date()): Promise<CatalogFreshness> {
    const result = await this.database.query<FreshnessRow>(
      `SELECT id, completed_at, source_watermark, fetched_count, queued_count, failed_count,
              processed_count, created_count, revised_count, unchanged_count
       FROM ingestion_runs
       WHERE status IN ('succeeded', 'partially_failed') AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC
       LIMIT 1`,
    );
    const run = result.rows[0];
    if (!run) {
      return {
        status: 'never_ingested',
        latestRunId: null,
        completedAt: null,
        sourceWatermark: null,
        ageSeconds: null,
        counts: null,
      };
    }

    const completedAt = new Date(run.completed_at);
    const ageSeconds = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 1000));
    const thresholdSeconds = Number(process.env.CATALOG_FRESHNESS_THRESHOLD_SECONDS ?? 900);
    return {
      status: ageSeconds <= thresholdSeconds ? 'fresh' : 'delayed',
      latestRunId: run.id,
      completedAt: completedAt.toISOString(),
      sourceWatermark: run.source_watermark ? new Date(run.source_watermark).toISOString() : null,
      ageSeconds,
      counts: {
        fetched: run.fetched_count,
        queued: run.queued_count,
        failed: run.failed_count,
        processed: run.processed_count,
        created: run.created_count,
        revised: run.revised_count,
        unchanged: run.unchanged_count,
      },
    };
  }
}
