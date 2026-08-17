import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
    private readonly registry = new Registry();
    private readonly requestCounter: Counter<string>;
    private readonly requestDuration: Histogram<string>;
    private readonly activeRequests: Gauge<string>;
    private readonly cacheHitsTotal: Counter<string>;
    private readonly cacheMissesTotal: Counter<string>;
    private readonly databaseQueriesTotal: Counter<string>;
    private readonly cacheHitRateGauge: Gauge<string>;
    private readonly redisLatencyMs: Histogram<string>;
    private readonly databaseLatencyMs: Histogram<string>;
    private readonly totalRequestLatencyMs: Histogram<string>;
    private cacheHits = 0;
    private cacheMisses = 0;
    private databaseQueries = 0;

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

        this.cacheHitsTotal = new Counter({
            name: 'cache_hits_total',
            help: 'Total cache hits',
            registers: [this.registry],
        });

        this.cacheMissesTotal = new Counter({
            name: 'cache_misses_total',
            help: 'Total cache misses',
            registers: [this.registry],
        });

        this.databaseQueriesTotal = new Counter({
            name: 'database_queries',
            help: 'Total database queries issued by cache scenario',
            registers: [this.registry],
        });

        this.cacheHitRateGauge = new Gauge({
            name: 'cache_hit_rate',
            help: 'Cache hit rate ratio',
            registers: [this.registry],
        });

        this.redisLatencyMs = new Histogram({
            name: 'redis_latency',
            help: 'Redis roundtrip latency in milliseconds',
            buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200],
            registers: [this.registry],
        });

        this.databaseLatencyMs = new Histogram({
            name: 'database_latency',
            help: 'Database query latency in milliseconds',
            buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500],
            registers: [this.registry],
        });

        this.totalRequestLatencyMs = new Histogram({
            name: 'total_request_latency',
            help: 'End-to-end cache endpoint request latency in milliseconds',
            buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
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

    recordCacheHit(): void {
        this.cacheHits += 1;
        this.cacheHitsTotal.inc();
        this.updateCacheHitRate();
    }

    recordCacheMiss(): void {
        this.cacheMisses += 1;
        this.cacheMissesTotal.inc();
        this.updateCacheHitRate();
    }

    recordDatabaseQuery(): void {
        this.databaseQueries += 1;
        this.databaseQueriesTotal.inc();
    }

    observeRedisLatency(latencyMs: number): void {
        this.redisLatencyMs.observe(latencyMs);
    }

    observeDatabaseLatency(latencyMs: number): void {
        this.databaseLatencyMs.observe(latencyMs);
    }

    observeTotalRequestLatency(latencyMs: number): void {
        this.totalRequestLatencyMs.observe(latencyMs);
    }

    resetCacheStats(): void {
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.databaseQueries = 0;
        this.cacheHitRateGauge.set(0);
    }

    getCacheStats(): {
        cache_hits_total: number;
        cache_misses_total: number;
        cache_hit_rate: number;
        database_queries: number;
    } {
        const total = this.cacheHits + this.cacheMisses;
        const rate = total === 0 ? 0 : this.cacheHits / total;
        return {
            cache_hits_total: this.cacheHits,
            cache_misses_total: this.cacheMisses,
            cache_hit_rate: Number(rate.toFixed(4)),
            database_queries: this.databaseQueries,
        };
    }

    private updateCacheHitRate(): void {
        const total = this.cacheHits + this.cacheMisses;
        const rate = total === 0 ? 0 : this.cacheHits / total;
        this.cacheHitRateGauge.set(rate);
    }
}
