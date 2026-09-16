import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAIModelProvider } from '../src/chat/model-provider';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAIModelProvider', () => {
  it('normalizes Responses API function calls without exposing the API key in input', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: 'function_call',
                call_id: 'call-1',
                name: 'get_event',
                arguments: '{"eventId":"00000000-0000-4000-8000-000000000001"}',
              },
            ],
            usage: { input_tokens: 8, output_tokens: 3 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAIModelProvider('secret-key', 'test-model').complete(
      [{ role: 'user', content: 'Find this event' }],
      true,
    );

    expect(result.toolCalls[0]).toMatchObject({ callId: 'call-1', name: 'get_event' });
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const request = calls[0]![1];
    expect(String(request.body)).not.toContain('secret-key');
    expect((request.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
  });

  it('parses streamed text deltas and usage', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"response.output_text.delta","delta":"Grounded answer"}\n\n' +
              'data: {"type":"response.completed","response":{"usage":{"input_tokens":9,"output_tokens":4}}}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );

    const events = [];
    for await (const event of new OpenAIModelProvider('key', 'test-model').stream([])) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'delta', text: 'Grounded answer' },
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } },
    ]);
  });
});
