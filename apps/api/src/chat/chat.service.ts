import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { ChatRequest, ChatStreamEvent } from '@earthquake/contracts';
import type { Logger } from '@earthquake/observability';

import type { CatalogChatTools, ChatToolName } from './chat-tools';
import { CatalogChatTools as CatalogChatToolsToken, CHAT_TOOL_NAMES } from './chat-tools';
import { MODEL_PROVIDER, type ModelProvider, type ModelUsage } from './model-provider';

export const CHAT_LOGGER = Symbol('CHAT_LOGGER');
const predictionPattern =
  /\b(predict|prediction|forecast|when will|next earthquake|will there be)\b/i;
const refusal =
  'I can’t predict when or where an earthquake will occur. This system explores historical catalog records and explicitly inferred candidate series; those groupings do not forecast future activity.';

@Injectable()
export class ChatService {
  constructor(
    @Inject(MODEL_PROVIDER) private readonly model: ModelProvider,
    @Inject(CatalogChatToolsToken) private readonly tools: CatalogChatTools,
    @Inject(CHAT_LOGGER) private readonly logger: Logger,
  ) {}

  async *respond(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const requestId = randomUUID();
    const started = performance.now();
    let totalUsage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    if (predictionPattern.test(request.message)) {
      yield { type: 'delta', text: refusal };
      yield { type: 'done', usage: totalUsage };
      this.logger.info('Chat prediction request refused', {
        requestId,
        latencyMs: Math.round(performance.now() - started),
      });
      return;
    }

    const input: unknown[] = [
      ...request.history.map((message) => ({ role: message.role, content: message.content })),
      {
        role: 'user',
        content: `${request.message}${dashboardContext(request)}`,
      },
    ];
    yield { type: 'status', phase: 'thinking' };
    const modelStarted = performance.now();
    const turn = await this.model.complete(input, true);
    totalUsage = addUsage(totalUsage, turn.usage);
    this.logger.info('Chat model planning completed', {
      requestId,
      model: this.model.model,
      latencyMs: Math.round(performance.now() - modelStarted),
      inputTokens: turn.usage.inputTokens,
      outputTokens: turn.usage.outputTokens,
    });

    if (turn.toolCalls.length === 0) {
      for (const text of chunks(turn.text || 'I need a catalog query to answer that reliably.')) {
        yield { type: 'delta', text };
      }
    } else {
      const calls = turn.toolCalls.slice(0, 3);
      const outputs: unknown[] = [];
      const seenCitations = new Set<string>();
      for (const call of calls) {
        if (!CHAT_TOOL_NAMES.includes(call.name as ChatToolName))
          throw new Error('Model selected an unsupported tool');
        const tool = call.name as ChatToolName;
        yield { type: 'status', phase: 'tool', tool };
        const toolStarted = performance.now();
        const result = await this.tools.execute(tool, JSON.parse(call.arguments) as unknown);
        this.logger.info('Chat catalog tool completed', {
          requestId,
          tool,
          latencyMs: Math.round(performance.now() - toolStarted),
          resultCount: result.resultCount,
        });
        for (const citation of result.citations) {
          const key = `${citation.kind}:${citation.id}`;
          if (!seenCitations.has(key)) {
            seenCitations.add(key);
            yield { type: 'citation', citation };
          }
        }
        outputs.push({
          type: 'function_call_output',
          call_id: call.callId,
          output: JSON.stringify(result.output),
        });
      }
      const finalInput = [...input, ...turn.output, ...outputs];
      const finalStarted = performance.now();
      for await (const event of this.model.stream(finalInput)) {
        if (event.type === 'delta') yield { type: 'delta', text: event.text };
        else totalUsage = addUsage(totalUsage, event.usage);
      }
      this.logger.info('Chat grounded response completed', {
        requestId,
        model: this.model.model,
        latencyMs: Math.round(performance.now() - finalStarted),
        toolCount: calls.length,
        citationCount: seenCitations.size,
      });
    }
    yield { type: 'done', usage: totalUsage };
    this.logger.info('Chat request completed', {
      requestId,
      latencyMs: Math.round(performance.now() - started),
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
    });
  }
}

function dashboardContext(request: ChatRequest): string {
  const values = [
    request.context?.selectedEventId
      ? `selected event ID: ${request.context.selectedEventId}`
      : undefined,
    request.context?.selectedSeriesId
      ? `selected candidate series ID: ${request.context.selectedSeriesId}`
      : undefined,
  ].filter(Boolean);
  return values.length > 0 ? `\n\nCurrent dashboard context (${values.join('; ')}).` : '';
}

function addUsage(first: ModelUsage, second: ModelUsage): ModelUsage {
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
  };
}

function chunks(value: string): string[] {
  return value.match(/.{1,24}(?:\s+|$)/g) ?? [value];
}
