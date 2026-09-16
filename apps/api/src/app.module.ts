import { Module } from '@nestjs/common';

import { createDatabasePool, DATABASE } from './database.provider';
import { FreshnessController } from './freshness.controller';
import { FreshnessService } from './freshness.service';
import { HealthController } from './health.controller';
import { ClassificationRunsController, SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ChatController } from './chat/chat.controller';
import { ChatRateLimiter } from './chat/chat-rate-limiter';
import { ChatService, CHAT_LOGGER } from './chat/chat.service';
import { CatalogChatTools } from './chat/chat-tools';
import { MODEL_PROVIDER, OpenAIModelProvider } from './chat/model-provider';
import { createLogger } from '@earthquake/observability';

@Module({
  controllers: [
    HealthController,
    FreshnessController,
    EventsController,
    SeriesController,
    ClassificationRunsController,
    ChatController,
  ],
  providers: [
    FreshnessService,
    EventsService,
    SeriesService,
    ChatService,
    ChatRateLimiter,
    CatalogChatTools,
    { provide: CHAT_LOGGER, useFactory: () => createLogger('chat') },
    {
      provide: MODEL_PROVIDER,
      useFactory: () => new OpenAIModelProvider(process.env.OPENAI_API_KEY ?? ''),
    },
    {
      provide: DATABASE,
      useFactory: createDatabasePool,
    },
  ],
})
export class AppModule {}
