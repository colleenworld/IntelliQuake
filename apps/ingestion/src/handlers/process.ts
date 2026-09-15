import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

import { createLogger } from '@earthquake/observability';

import { createAwsProcessor } from '../composition';

const logger = createLogger('event-processor-handler');
let processorPromise: ReturnType<typeof createAwsProcessor> | undefined;

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  processorPromise ??= createAwsProcessor();
  const processor = await processorPromise;
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      await processor.process(JSON.parse(record.body) as unknown);
    } catch (error) {
      logger.error('Failed to process queue record', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
