import { classifierParameters } from '../classification/config';
import { createCandidateSeriesService } from '../classification/composition';

export async function handler(): Promise<{ classificationRunId: string }> {
  const analysisEnd = new Date();
  const analysisHours = Number(process.env.CLASSIFICATION_ANALYSIS_HOURS ?? 168);
  const analysisStart = new Date(analysisEnd.getTime() - analysisHours * 3_600_000);
  const result = await (
    await createCandidateSeriesService()
  ).run({
    analysisStart: analysisStart.toISOString(),
    analysisEnd: analysisEnd.toISOString(),
    parameters: classifierParameters(),
  });
  return { classificationRunId: result.id };
}
