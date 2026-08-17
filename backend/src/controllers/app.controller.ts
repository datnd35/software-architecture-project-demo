import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';
import { HealthService } from '../services/health.service';

@Controller()
export class AppController {
    constructor(
        private readonly metricsService: MetricsService,
        private readonly healthService: HealthService,
    ) { }

    @Get('health')
    health() {
        return this.healthService.check();
    }

    @Get('metrics')
    async metrics(@Res() res: Response) {
        res.setHeader('Content-Type', this.metricsService.contentType());
        res.send(await this.metricsService.metrics());
    }
}
