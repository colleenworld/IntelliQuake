import { classifierParameters } from '../classification/config';
import { createCandidateSeriesService } from '../classification/composition';
import { closeDatabasePool } from '../database';

async function classify(): Promise<void> {
  const service = await createCandidateSeriesService();
  const analysisEnd = new Date(process.env.CLASSIFICATION_END ?? Date.now());
  const analysisHours = Number(process.env.CLASSIFICATION_ANALYSIS_HOURS ?? 168);
  const analysisStart = new Date(
    process.env.CLASSIFICATION_START ?? analysisEnd.getTime() - analysisHours * 3_600_000,
  );
  const result = await service.run({
    analysisStart: analysisStart.toISOString(),
    analysisEnd: analysisEnd.toISOString(),
    parameters: classifierParameters(),
  });
  console.info(JSON.stringify(result));
}

void classify().finally(closeDatabasePool);
