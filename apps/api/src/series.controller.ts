import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type {
  ClassificationRunResponse,
  SeriesDetailResponse,
  SeriesSearchResponse,
} from '@earthquake/contracts';

import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(@Inject(SeriesService) private readonly series: SeriesService) {}

  @Get()
  search(@Query() query: Record<string, unknown>): Promise<SeriesSearchResponse> {
    return this.series.search(query);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<SeriesDetailResponse> {
    return this.series.findById(id);
  }
}

@Controller('classification-runs')
export class ClassificationRunsController {
  constructor(@Inject(SeriesService) private readonly series: SeriesService) {}

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<ClassificationRunResponse> {
    return this.series.findRunById(id);
  }
}
