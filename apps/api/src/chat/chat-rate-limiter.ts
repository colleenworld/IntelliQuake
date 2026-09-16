import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class ChatRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetsAt: number }>();

  assertAllowed(key: string, now = Date.now()): void {
    const configuredLimit = Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE ?? 10);
    const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 10;
    const existing = this.buckets.get(key);
    if (!existing || existing.resetsAt <= now) {
      this.buckets.set(key, { count: 1, resetsAt: now + 60_000 });
      return;
    }
    if (existing.count >= limit) {
      throw new HttpException('Chat rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    existing.count += 1;
  }
}
