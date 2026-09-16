import { Module } from '@nestjs/common';

import { createDatabasePool, DATABASE } from './database.provider';
import { FreshnessController } from './freshness.controller';
import { FreshnessService } from './freshness.service';
import { HealthController } from './health.controller';
import { ClassificationRunsController, SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [
    HealthController,
    FreshnessController,
    EventsController,
    SeriesController,
    ClassificationRunsController,
  ],
  providers: [
    FreshnessService,
    EventsService,
    SeriesService,
    {
      provide: DATABASE,
      useFactory: createDatabasePool,
    },
  ],
})
export class AppModule {}
