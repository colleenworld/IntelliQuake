import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@earthquake/observability';

import { ChatService } from '../src/chat/chat.service';
import type { CatalogChatTools } from '../src/chat/chat-tools';
import type { ModelProvider } from '../src/chat/model-provider';

const logger: Logger = { info: vi.fn(), error: vi.fn() };

async function collect(service: ChatService, message: string) {
  const events = [];
  for await (const event of service.respond({ message, history: [] })) events.push(event);
  return events;
}

describe('ChatService', () => {
  it('executes a typed tool and streams a grounded answer with citations', async () => {
    const provider: ModelProvider = {
      model: 'test-model',
      complete: vi.fn(async () => ({
        output: [
          {
            type: 'function_call',
            call_id: 'call-1',
            name: 'get_largest_events',
            arguments: '{"limit":1}',
          },
        ],
        text: '',
        toolCalls: [{ callId: 'call-1', name: 'get_largest_events', arguments: '{"limit":1}' }],
        usage: { inputTokens: 12, outputTokens: 4 },
      })),
      stream: async function* () {
        yield { type: 'delta' as const, text: 'The largest event was M 7.1.' };
        yield { type: 'usage' as const, usage: { inputTokens: 20, outputTokens: 9 } };
      },
    };
    const tools = {
      execute: vi.fn(async () => ({
        output: { events: [] },
        resultCount: 1,
        citations: [
          {
            kind: 'event' as const,
            id: '00000000-0000-4000-8000-000000000001',
            label: 'M 7.1 · Test event',
            href: '/?event=00000000-0000-4000-8000-000000000001',
          },
        ],
      })),
    } as unknown as CatalogChatTools;

    const events = await collect(
      new ChatService(provider, tools, logger),
      'What is the largest event?',
    );

    expect(tools.execute).toHaveBeenCalledWith('get_largest_events', { limit: 1 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'citation' }));
    expect(events).toContainEqual({ type: 'delta', text: 'The largest event was M 7.1.' });
    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 32, outputTokens: 13 } });
  });

  it('refuses earthquake prediction without calling the model or tools', async () => {
    const provider = {
      model: 'test',
      complete: vi.fn(),
      stream: vi.fn(),
    } as unknown as ModelProvider;
    const tools = { execute: vi.fn() } as unknown as CatalogChatTools;

    const events = await collect(
      new ChatService(provider, tools, logger),
      'When will the next earthquake happen?',
    );

    expect(events[0]).toMatchObject({
      type: 'delta',
      text: expect.stringContaining('can’t predict'),
    });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(tools.execute).not.toHaveBeenCalled();
  });
});
