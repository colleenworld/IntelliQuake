import { Module } from '@nestjs/common';

import { createDatabasePool, DATABASE } from './database.provider';
import { FreshnessController } from './freshness.controller';
import { FreshnessService } from './freshness.service';
import { HealthController } from './health.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [HealthController, FreshnessController, EventsController],
  providers: [
    FreshnessService,
    EventsService,
    {
      provide: DATABASE,
      useFactory: createDatabasePool,
    },
  ],
})
export class AppModule {}
