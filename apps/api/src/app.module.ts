import { Module } from '@nestjs/common';

import { createDatabasePool, DATABASE } from './database.provider';
import { FreshnessController } from './freshness.controller';
import { FreshnessService } from './freshness.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, FreshnessController],
  providers: [
    FreshnessService,
    {
      provide: DATABASE,
      useFactory: createDatabasePool,
    },
  ],
})
export class AppModule {}
