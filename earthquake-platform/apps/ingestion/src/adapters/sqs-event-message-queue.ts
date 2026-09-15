import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { RawEventMessageSchema, type RawEventMessage } from '@earthquake/contracts';

import type { EventMessageQueue } from '../ports';

export class SqsEventMessageQueue implements EventMessageQueue {
  constructor(
    private readonly queueUrl: string,
    private readonly client = new SQSClient({}),
  ) {}

  async send(message: RawEventMessage): Promise<void> {
    const validated = RawEventMessageSchema.parse(message);
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(validated),
        MessageAttributes: {
          messageType: { DataType: 'String', StringValue: validated.messageType },
          source: { DataType: 'String', StringValue: validated.source },
          schemaVersion: { DataType: 'Number', StringValue: String(validated.schemaVersion) },
        },
      }),
    );
  }
}
