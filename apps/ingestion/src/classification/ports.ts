import type {
  CandidateEdge,
  CandidateSeries,
  ClassifiableEvent,
  ClassifierParameters,
} from '@earthquake/classification';

export interface ClassificationCatalog {
  readSnapshot(input: {
    analysisStart: string;
    analysisEnd: string;
    catalogWatermark: string;
  }): Promise<ClassifiableEvent[]>;
}

export interface PersistedCandidateSeries extends CandidateSeries {
  id: string;
}

export interface ClassificationRunStart {
  id: string;
  algorithm: string;
  algorithmVersion: string;
  parameters: ClassifierParameters;
  catalogWatermark: string;
  analysisStart: string;
  analysisEnd: string;
  startedAt: string;
}

export interface ClassificationRunRepository {
  start(input: ClassificationRunStart): Promise<void>;
  complete(input: {
    id: string;
    completedAt: string;
    inputCount: number;
    edges: CandidateEdge[];
    series: PersistedCandidateSeries[];
  }): Promise<void>;
  fail(input: { id: string; completedAt: string; errorSummary: string }): Promise<void>;
}
