import type { RawEventMessage } from '@earthquake/contracts';

import type { EventMessageQueue } from '../ports';

export class DirectEventMessageQueue implements EventMessageQueue {
  constructor(private readonly processMessage: (message: RawEventMessage) => Promise<unknown>) {}

  async send(message: RawEventMessage): Promise<void> {
    await this.processMessage(message);
  }
}
