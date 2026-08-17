import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
    private readonly registry = new Registry();
    private readonly requestCounter: Counter<string>;
    private readonly requestDuration: Histogram<string>;
    private readonly activeRequests: Gauge<string>;

    constructor() {
        collectDefaultMetrics({ register: this.registry });

        this.requestCounter = new Counter({
            name: 'http_requests_total',
            help: 'Total HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [this.registry],
        });

        this.requestDuration = new Histogram({
            name: 'http_request_duration_seconds',
            help: 'HTTP request duration in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
            registers: [this.registry],
        });

        this.activeRequests = new Gauge({
            name: 'http_active_requests',
            help: 'Current in-flight HTTP requests',
            registers: [this.registry],
        });
    }

    onRequestStart(): void {
        this.activeRequests.inc();
    }

    onRequestEnd(method: string, route: string, statusCode: number, durationSeconds: number): void {
        const labels = {
            method: method.toUpperCase(),
            route,
            status_code: String(statusCode),
        };

        this.requestCounter.inc(labels);
        this.requestDuration.observe(labels, durationSeconds);
        this.activeRequests.dec();
    }

    contentType(): string {
        return this.registry.contentType;
    }

    metrics(): Promise<string> {
        return this.registry.metrics();
    }
}
