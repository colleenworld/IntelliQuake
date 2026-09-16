import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ChatRateLimiter } from '../src/chat/chat-rate-limiter';

describe('ChatRateLimiter', () => {
  it('limits repeated requests and resets the fixed window', () => {
    process.env.CHAT_RATE_LIMIT_PER_MINUTE = '2';
    const limiter = new ChatRateLimiter();
    limiter.assertAllowed('client', 1_000);
    limiter.assertAllowed('client', 1_001);
    expect(() => limiter.assertAllowed('client', 1_002)).toThrow(HttpException);
    expect(() => limiter.assertAllowed('client', 61_001)).not.toThrow();
  });
});
