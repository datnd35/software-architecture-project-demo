import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from '../services/metrics.service';

@Controller()
export class AppController {
    constructor(private readonly metricsService: MetricsService) { }

    @Get('health')
    health() {
        return {
            status: 'ok',
            service: 'performance-engineering-lab-backend',
            ts: new Date().toISOString(),
        };
    }

    @Get('metrics')
    async metrics(@Res() res: Response) {
        res.setHeader('Content-Type', this.metricsService.contentType());
        res.send(await this.metricsService.metrics());
    }
}
