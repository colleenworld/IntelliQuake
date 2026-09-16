import {
  classifyEvents,
  CLASSIFIER_ALGORITHM,
  CLASSIFIER_VERSION,
  type ClassifierParameters,
} from '@earthquake/classification';
import type { Logger } from '@earthquake/observability';

import type { Clock, IdGenerator } from '../ports';
import type { ClassificationCatalog, ClassificationRunRepository } from './ports';

export interface ClassificationRunResult {
  id: string;
  catalogWatermark: string;
  inputCount: number;
  seriesCount: number;
  membershipCount: number;
}

export class CandidateSeriesService {
  constructor(
    private readonly catalog: ClassificationCatalog,
    private readonly runs: ClassificationRunRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  async run(input: {
    analysisStart: string;
    analysisEnd: string;
    parameters: ClassifierParameters;
  }): Promise<ClassificationRunResult> {
    if (Date.parse(input.analysisStart) >= Date.parse(input.analysisEnd)) {
      throw new Error('analysisStart must precede analysisEnd');
    }
    const id = this.ids.generate();
    const startedAt = this.clock.now().toISOString();
    const catalogWatermark = startedAt;
    await this.runs.start({
      id,
      algorithm: CLASSIFIER_ALGORITHM,
      algorithmVersion: CLASSIFIER_VERSION,
      parameters: input.parameters,
      catalogWatermark,
      analysisStart: input.analysisStart,
      analysisEnd: input.analysisEnd,
      startedAt,
    });

    try {
      const events = await this.catalog.readSnapshot({
        analysisStart: input.analysisStart,
        analysisEnd: input.analysisEnd,
        catalogWatermark,
      });
      const result = classifyEvents(events, input.parameters);
      const series = result.series.map((candidate) => ({ ...candidate, id: this.ids.generate() }));
      const completedAt = this.clock.now().toISOString();
      await this.runs.complete({
        id,
        completedAt,
        inputCount: result.inputCount,
        edges: result.edges,
        series,
      });
      const membershipCount = series.reduce(
        (count, candidate) => count + candidate.memberships.length,
        0,
      );
      this.logger.info('Candidate series classification completed', {
        classificationRunId: id,
        inputCount: result.inputCount,
        seriesCount: series.length,
        membershipCount,
      });
      return {
        id,
        catalogWatermark,
        inputCount: result.inputCount,
        seriesCount: series.length,
        membershipCount,
      };
    } catch (error) {
      const errorSummary = error instanceof Error ? error.message : 'Unknown classification error';
      await this.runs.fail({ id, completedAt: this.clock.now().toISOString(), errorSummary });
      this.logger.error('Candidate series classification failed', {
        classificationRunId: id,
        error: errorSummary,
      });
      throw error;
    }
  }
}
