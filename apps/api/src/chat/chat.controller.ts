import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ChatRequestSchema, ChatStreamEventSchema } from '@earthquake/contracts';

import type { ChatRateLimiter } from './chat-rate-limiter';
import { ChatRateLimiter as ChatRateLimiterToken } from './chat-rate-limiter';
import type { ChatService } from './chat.service';
import { ChatService as ChatServiceToken } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    @Inject(ChatServiceToken) private readonly chat: ChatService,
    @Inject(ChatRateLimiterToken) private readonly rateLimiter: ChatRateLimiter,
  ) {}

  @Post()
  async respond(
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.rateLimiter.assertAllowed(request.ip);
    const parsed = ChatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid chat request',
        issues: parsed.error.issues,
      });
    }
    const body = parsed.data;
    reply.raw.writeHead(HttpStatus.OK, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    try {
      for await (const event of this.chat.respond(body)) {
        reply.raw.write(`data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat request failed';
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
}
