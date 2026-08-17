import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
    private readonly registry = new Registry();
    private readonly requestCount: Counter<string>;
    private readonly latencyHistogram: Histogram<string>;
    private readonly queueGauge: Gauge<string>;

    constructor() {
        collectDefaultMetrics({ register: this.registry });

        this.requestCount = new Counter({
            name: 'pel_requests_total',
            help: 'Total requests by simulated operation',
            labelNames: ['operation'],
            registers: [this.registry],
        });

        this.latencyHistogram = new Histogram({
            name: 'pel_latency_ms',
            help: 'Latency distribution in ms',
            labelNames: ['operation'],
            buckets: [5, 10, 20, 50, 100, 200, 500, 1000],
            registers: [this.registry],
        });

        this.queueGauge = new Gauge({
            name: 'pel_queue_depth',
            help: 'Current queue depth in queue simulation',
            registers: [this.registry],
        });
    }

    count(operation: string): void {
        this.requestCount.inc({ operation });
    }

    observeLatency(operation: string, latencyMs: number): void {
        this.latencyHistogram.observe({ operation }, latencyMs);
    }

    setQueueDepth(value: number): void {
        this.queueGauge.set(value);
    }

    contentType(): string {
        return this.registry.contentType;
    }

    metrics(): Promise<string> {
        return this.registry.metrics();
    }
}
