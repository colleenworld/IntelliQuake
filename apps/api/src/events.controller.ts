import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { EventDetailResponse, EventSearchResponse } from '@earthquake/contracts';

import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

  @Get()
  search(@Query() query: Record<string, unknown>): Promise<EventSearchResponse> {
    return this.events.search(query);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<EventDetailResponse> {
    return this.events.findById(id);
  }
}
