import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
    constructor(private readonly metricsService: MetricsService) { }

    use(req: Request, res: Response, next: NextFunction): void {
        this.metricsService.onRequestStart();
        const startedAt = process.hrtime.bigint();

        res.on('finish', () => {
            const endedAt = process.hrtime.bigint();
            const durationSeconds = Number(endedAt - startedAt) / 1_000_000_000;
            const route = req.route?.path ? String(req.route.path) : req.path;

            this.metricsService.onRequestEnd(req.method, route, res.statusCode, durationSeconds);
        });

        next();
    }
}
