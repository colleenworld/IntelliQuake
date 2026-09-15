import { Controller, Get, Inject } from '@nestjs/common';

import { type CatalogFreshness, FreshnessService } from './freshness.service';

@Controller('system/freshness')
export class FreshnessController {
  constructor(@Inject(FreshnessService) private readonly freshness: FreshnessService) {}

  @Get()
  getFreshness(): Promise<CatalogFreshness> {
    return this.freshness.getFreshness();
  }
}
