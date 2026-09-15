import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  service: 'earthquake-api';
  status: 'ok';
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { service: 'earthquake-api', status: 'ok' };
  }
}
