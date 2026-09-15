import type { IngestionResult } from '../application/ingestion-producer';
import { createAwsProducer } from '../composition';

let producerPromise: ReturnType<typeof createAwsProducer> | undefined;

export async function handler(): Promise<IngestionResult> {
  producerPromise ??= createAwsProducer();
  const producer = await producerPromise;
  return producer.poll();
}
