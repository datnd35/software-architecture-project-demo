import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { StorageService } from '../services/storage.service';
import { MetricsService } from '../metrics/metrics.service';

type BaselineMetrics = {
    requestCount: number;
    throughput: number;
    p50: number;
    p95: number;
    p99: number;
    averageLatencyMs: number;
};

type QueueSimulationInput = {
    arrivalRate: number;
    processingCapacity: number;
    workers: number;
    durationSeconds: number;
};

type QueueSimulationMetrics = {
    queue_size: number;
    active_workers: number;
    waiting_requests: number;
    processing_time: number;
    waiting_time: number;
    total_latency: number;
    throughput: number;
    p50: number;
    p95: number;
    p99: number;
    request_count: number;
};

type QueueSimulationTimeline = {
    incoming: number[];
    queueSize: number[];
    activeWorkers: number[];
};

type CpuLevel = 'light' | 'medium' | 'heavy' | 'extreme';
type DiskSize = 'small' | 'medium' | 'large';
type MemoryWorkload = 'small' | 'medium' | 'large';

type ResourceSnapshot = {
    cpu: {
        userMs: number;
        systemMs: number;
        totalMs: number;
    };
    memory: {
        rssMb: number;
        heapUsedMb: number;
    };
};

type ScenarioResponse = {
    scenario: string;
    processingTime: number;
    totalLatency: number;
    throughput: number;
    cpu: ResourceSnapshot['cpu'];
    memory: ResourceSnapshot['memory'];
    timestamp: string;
};

type CacheMode = 'on' | 'off';

@Injectable()
export class PerformanceService {
    private readonly startedAt = Date.now();
    private readonly durationsMs: number[] = [];
    private readonly maxSamples = 5000;
    private requestCount = 0;
    private readonly scenarioStartedAt = Date.now();
    private readonly scenarioRequestCounts: Record<string, number> = {};
    private readonly cacheTtlSeconds: number;

    constructor(
        private readonly storageService: StorageService,
        private readonly metricsService: MetricsService,
    ) {
        const ttl = Number(process.env.CACHE_TTL_SECONDS ?? 30);
        this.cacheTtlSeconds = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 30;
    }

    async runCacheUserExperiment(idInput: number, modeInput: string): Promise<{
        scenario: 'caching';
        cacheStatus: 'ON' | 'OFF';
        source: 'redis' | 'database';
        user: { id: number; name: string; email: string };
        ttlSeconds: number;
        processingTime: number;
        totalLatency: number;
        throughput: number;
        cpu: ResourceSnapshot['cpu'];
        memory: ResourceSnapshot['memory'];
        metrics: {
            cache_hits_total: number;
            cache_misses_total: number;
            cache_hit_rate: number;
            database_queries: number;
            redis_latency: number;
            database_latency: number;
            total_request_latency: number;
        };
        timestamp: string;
    }> {
        const id = this.clamp(idInput, 1, 1_000_000);
        const mode: CacheMode = this.normalizeCacheMode(modeInput);
        const cacheEnabled = mode === 'on';
        const key = `pel:user:${id}`;
        const cpuStart = process.cpuUsage();
        const start = performance.now();

        let redisLatency = 0;
        let databaseLatency = 0;
        let source: 'redis' | 'database' = 'database';
        let user: { id: number; name: string; email: string };

        if (cacheEnabled) {
            try {
                const cacheRead = await this.storageService.getCacheValue(key);
                redisLatency += cacheRead.latencyMs;
                this.metricsService.observeRedisLatency(cacheRead.latencyMs);

                if (cacheRead.value) {
                    user = JSON.parse(cacheRead.value) as { id: number; name: string; email: string };
                    this.metricsService.recordCacheHit();
                    source = 'redis';

                    const processingTime = Number((performance.now() - start).toFixed(3));
                    const snapshot = this.captureSnapshot(cpuStart);
                    const throughput = this.recordScenarioThroughput('caching');
                    this.metricsService.observeTotalRequestLatency(processingTime);

                    const stat = this.metricsService.getCacheStats();
                    return {
                        scenario: 'caching',
                        cacheStatus: 'ON',
                        source,
                        user,
                        ttlSeconds: this.cacheTtlSeconds,
                        processingTime,
                        totalLatency: processingTime,
                        throughput,
                        cpu: snapshot.cpu,
                        memory: snapshot.memory,
                        metrics: {
                            ...stat,
                            redis_latency: Number(redisLatency.toFixed(3)),
                            database_latency: 0,
                            total_request_latency: processingTime,
                        },
                        timestamp: new Date().toISOString(),
                    };
                }
            } catch {
                // fall through to DB path if Redis unavailable
            }
        }

        this.metricsService.recordCacheMiss();
        const dbResult = await this.storageService.getUserById(id);
        databaseLatency = dbResult.latencyMs;
        this.metricsService.recordDatabaseQuery();
        this.metricsService.observeDatabaseLatency(databaseLatency);
        user = dbResult.user;

        if (cacheEnabled) {
            try {
                const cacheWrite = await this.storageService.setCacheValue(key, JSON.stringify(user), this.cacheTtlSeconds);
                redisLatency += cacheWrite.latencyMs;
                this.metricsService.observeRedisLatency(cacheWrite.latencyMs);
            } catch {
                // ignore cache write failure, still return DB result
            }
        }

        const totalLatency = Number((performance.now() - start).toFixed(3));
        const snapshot = this.captureSnapshot(cpuStart);
        const throughput = this.recordScenarioThroughput('caching');
        this.metricsService.observeTotalRequestLatency(totalLatency);
        const stat = this.metricsService.getCacheStats();

        return {
            scenario: 'caching',
            cacheStatus: cacheEnabled ? 'ON' : 'OFF',
            source: 'database',
            user,
            ttlSeconds: this.cacheTtlSeconds,
            processingTime: databaseLatency,
            totalLatency,
            throughput,
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            metrics: {
                ...stat,
                redis_latency: Number(redisLatency.toFixed(3)),
                database_latency: Number(databaseLatency.toFixed(3)),
                total_request_latency: totalLatency,
            },
            timestamp: new Date().toISOString(),
        };
    }

    async clearCacheExperiment(): Promise<{ clearedKeys: number; status: 'ok'; timestamp: string }> {
        const clearedKeys = await this.storageService.clearCacheByPrefix('pel:user:');
        this.metricsService.resetCacheStats();
        return {
            clearedKeys,
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }

    runQueueSimulation(input: QueueSimulationInput): {
        scenario: 'queue-buildup';
        config: QueueSimulationInput;
        metrics: QueueSimulationMetrics;
        timeline: QueueSimulationTimeline;
        explanation: string;
        timestamp: string;
    } {
        const arrivalRate = this.clamp(input.arrivalRate, 1, 5000);
        const processingCapacity = this.clamp(input.processingCapacity, 1, 1000);
        const workers = this.clamp(input.workers, 1, 128);
        const durationSeconds = this.clamp(input.durationSeconds, 5, 120);

        const tickMs = 100;
        const ticks = Math.floor((durationSeconds * 1000) / tickMs);
        const arrivalPerTick = (arrivalRate * tickMs) / 1000;
        const servicePerWorkerPerTick = (processingCapacity * tickMs) / 1000;
        const processingTimePerRequest = Number((1000 / processingCapacity).toFixed(3));

        const queue: number[] = [];
        const waitingSamples: number[] = [];
        const processingSamples: number[] = [];
        const totalLatencySamples: number[] = [];

        const incomingTimeline: number[] = [];
        const queueTimeline: number[] = [];
        const activeWorkersTimeline: number[] = [];

        let arrivalCarry = 0;
        let serviceCarry = 0;
        let completed = 0;
        let lastActiveWorkers = 0;
        let maxQueueSize = 0;

        for (let tick = 0; tick < ticks; tick += 1) {
            const simulatedTimeMs = tick * tickMs;

            arrivalCarry += arrivalPerTick;
            const arrivalsThisTick = Math.floor(arrivalCarry);
            arrivalCarry -= arrivalsThisTick;

            for (let i = 0; i < arrivalsThisTick; i += 1) {
                queue.push(simulatedTimeMs);
            }

            serviceCarry += workers * servicePerWorkerPerTick;
            const canProcessThisTick = Math.floor(serviceCarry);
            serviceCarry -= canProcessThisTick;

            const processedThisTick = Math.min(queue.length, canProcessThisTick);
            const activeWorkers = processedThisTick > 0 ? Math.min(workers, processedThisTick) : 0;

            for (let i = 0; i < processedThisTick; i += 1) {
                const arrivalTime = queue.shift();
                if (arrivalTime === undefined) {
                    break;
                }
                const waitingTime = Math.max(simulatedTimeMs - arrivalTime, 0);
                const totalLatency = Number((waitingTime + processingTimePerRequest).toFixed(3));

                waitingSamples.push(waitingTime);
                processingSamples.push(processingTimePerRequest);
                totalLatencySamples.push(totalLatency);
                completed += 1;
            }

            if (queue.length > maxQueueSize) {
                maxQueueSize = queue.length;
            }
            lastActiveWorkers = activeWorkers;

            incomingTimeline.push(arrivalsThisTick);
            queueTimeline.push(queue.length);
            activeWorkersTimeline.push(activeWorkers);
        }

        const throughput = Number((completed / durationSeconds).toFixed(3));
        const sortedLatency = [...totalLatencySamples].sort((a, b) => a - b);

        return {
            scenario: 'queue-buildup',
            config: {
                arrivalRate,
                processingCapacity,
                workers,
                durationSeconds,
            },
            metrics: {
                queue_size: maxQueueSize,
                active_workers: lastActiveWorkers,
                waiting_requests: queue.length,
                processing_time: this.average(processingSamples),
                waiting_time: this.average(waitingSamples),
                total_latency: this.average(totalLatencySamples),
                throughput,
                p50: this.quantile(sortedLatency, 0.5),
                p95: this.quantile(sortedLatency, 0.95),
                p99: this.quantile(sortedLatency, 0.99),
                request_count: completed,
            },
            timeline: {
                incoming: incomingTimeline,
                queueSize: queueTimeline,
                activeWorkers: activeWorkersTimeline,
            },
            explanation:
                'If incoming requests arrive faster than the system can process them, the queue grows and waiting time becomes the dominant part of latency.',
            timestamp: new Date().toISOString(),
        };
    }

    runCpuLatency(levelInput: string): ScenarioResponse & { level: CpuLevel } {
        const level = this.normalizeCpuLevel(levelInput);
        const workDurationMap: Record<CpuLevel, number> = {
            light: 8,
            medium: 20,
            heavy: 45,
            extreme: 90,
        };

        const cpuStart = process.cpuUsage();
        const start = performance.now();
        const targetDurationMs = workDurationMap[level];

        while (performance.now() - start < targetDurationMs) {
            Math.sqrt(Math.random() * 1_000_000);
        }

        const processingTime = Number((performance.now() - start).toFixed(3));
        const snapshot = this.captureSnapshot(cpuStart);

        return {
            scenario: 'cpu-latency',
            level,
            processingTime,
            totalLatency: processingTime,
            throughput: this.recordScenarioThroughput('cpu-latency'),
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            timestamp: new Date().toISOString(),
        };
    }

    async runNetworkLatency(delayInput: number): Promise<ScenarioResponse & { delay: number }> {
        const allowed = [0, 50, 100, 200, 500, 1000] as const;
        const delay = this.closestAllowedDelay(delayInput, allowed);
        const cpuStart = process.cpuUsage();

        const start = performance.now();
        const processingStart = performance.now();
        const payload = { ok: true, at: Date.now() };
        const processingTime = Number((performance.now() - processingStart).toFixed(3));

        await new Promise((resolve) => setTimeout(resolve, delay));
        void payload;

        const totalLatency = Number((performance.now() - start).toFixed(3));
        const snapshot = this.captureSnapshot(cpuStart);

        return {
            scenario: 'network-latency',
            delay,
            processingTime,
            totalLatency,
            throughput: this.recordScenarioThroughput('network-latency'),
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            timestamp: new Date().toISOString(),
        };
    }

    async runDiskLatency(sizeInput: string): Promise<ScenarioResponse & { size: DiskSize }> {
        const size = this.normalizeDiskSize(sizeInput);
        const byteMap: Record<DiskSize, number> = {
            small: 64 * 1024,
            medium: 512 * 1024,
            large: 2 * 1024 * 1024,
        };

        const bytes = byteMap[size];
        const tempPath = join(tmpdir(), `pel-disk-${randomUUID()}.tmp`);
        const buffer = Buffer.alloc(bytes, 7);

        const cpuStart = process.cpuUsage();
        const start = performance.now();
        let processingTime = 0;

        try {
            const processingStart = performance.now();
            await fs.writeFile(tempPath, buffer);
            await fs.readFile(tempPath);
            processingTime = Number((performance.now() - processingStart).toFixed(3));
        } finally {
            try {
                await fs.unlink(tempPath);
            } catch {
                // best effort cleanup
            }
        }

        const totalLatency = Number((performance.now() - start).toFixed(3));
        const snapshot = this.captureSnapshot(cpuStart);

        return {
            scenario: 'disk-latency',
            size,
            processingTime,
            totalLatency,
            throughput: this.recordScenarioThroughput('disk-latency'),
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            timestamp: new Date().toISOString(),
        };
    }

    runMemoryLatency(workloadInput: string): ScenarioResponse & { workload: MemoryWorkload } {
        const workload = this.normalizeMemoryWorkload(workloadInput);
        const sizeMap: Record<MemoryWorkload, number> = {
            small: 250_000,
            medium: 750_000,
            large: 1_500_000,
        };

        const cpuStart = process.cpuUsage();
        const start = performance.now();
        const processingStart = performance.now();

        const length = sizeMap[workload];
        const arr = new Float64Array(length);
        let checksum = 0;
        for (let i = 0; i < arr.length; i += 1) {
            arr[i] = (i % 1000) * 0.5;
            checksum += arr[i];
        }

        const processingTime = Number((performance.now() - processingStart).toFixed(3));
        void checksum;
        const totalLatency = Number((performance.now() - start).toFixed(3));
        const snapshot = this.captureSnapshot(cpuStart);

        return {
            scenario: 'memory-latency',
            workload,
            processingTime,
            totalLatency,
            throughput: this.recordScenarioThroughput('memory-latency'),
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            timestamp: new Date().toISOString(),
        };
    }

    async runBaseline(): Promise<{
        scenario: 'baseline';
        processingTimeMs: number;
        timestamp: string;
        metrics: BaselineMetrics;
    }> {
        const started = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 1));
        const completed = performance.now();

        const observedDurationMs = Number((completed - started).toFixed(3));
        this.recordDuration(observedDurationMs);

        return {
            scenario: 'baseline',
            processingTimeMs: 1,
            timestamp: new Date().toISOString(),
            metrics: this.getSnapshot(),
        };
    }

    getSnapshot(): BaselineMetrics {
        const count = this.requestCount;
        const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.001);
        const sorted = [...this.durationsMs].sort((a, b) => a - b);

        return {
            requestCount: count,
            throughput: Number((count / elapsedSeconds).toFixed(3)),
            p50: this.quantile(sorted, 0.5),
            p95: this.quantile(sorted, 0.95),
            p99: this.quantile(sorted, 0.99),
            averageLatencyMs: this.average(sorted),
        };
    }

    private recordDuration(durationMs: number): void {
        this.requestCount += 1;
        this.durationsMs.push(durationMs);
        if (this.durationsMs.length > this.maxSamples) {
            this.durationsMs.shift();
        }
    }

    private quantile(sorted: number[], q: number): number {
        if (sorted.length === 0) {
            return 0;
        }
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
        return Number(sorted[index].toFixed(3));
    }

    private average(values: number[]): number {
        if (values.length === 0) {
            return 0;
        }
        const sum = values.reduce((acc, value) => acc + value, 0);
        return Number((sum / values.length).toFixed(3));
    }

    private clamp(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(max, Math.max(min, Math.floor(value)));
    }

    private normalizeCpuLevel(level: string): CpuLevel {
        if (level === 'light' || level === 'medium' || level === 'heavy' || level === 'extreme') {
            return level;
        }
        return 'light';
    }

    private normalizeDiskSize(size: string): DiskSize {
        if (size === 'small' || size === 'medium' || size === 'large') {
            return size;
        }
        return 'medium';
    }

    private normalizeMemoryWorkload(workload: string): MemoryWorkload {
        if (workload === 'small' || workload === 'medium' || workload === 'large') {
            return workload;
        }
        return 'medium';
    }

    private normalizeCacheMode(mode: string): CacheMode {
        return mode === 'off' ? 'off' : 'on';
    }

    private closestAllowedDelay(value: number, allowed: readonly number[]): number {
        if (!Number.isFinite(value)) {
            return allowed[0];
        }
        let nearest = allowed[0];
        let minDiff = Math.abs(value - nearest);
        for (const item of allowed) {
            const diff = Math.abs(value - item);
            if (diff < minDiff) {
                nearest = item;
                minDiff = diff;
            }
        }
        return nearest;
    }

    private recordScenarioThroughput(scenario: string): number {
        const currentCount = (this.scenarioRequestCounts[scenario] ?? 0) + 1;
        this.scenarioRequestCounts[scenario] = currentCount;
        const elapsedSeconds = Math.max((Date.now() - this.scenarioStartedAt) / 1000, 0.001);
        return Number((currentCount / elapsedSeconds).toFixed(3));
    }

    private captureSnapshot(cpuStart: NodeJS.CpuUsage): ResourceSnapshot {
        const cpuDiff = process.cpuUsage(cpuStart);
        const userMs = Number((cpuDiff.user / 1000).toFixed(3));
        const systemMs = Number((cpuDiff.system / 1000).toFixed(3));
        const memoryUsage = process.memoryUsage();

        return {
            cpu: {
                userMs,
                systemMs,
                totalMs: Number((userMs + systemMs).toFixed(3)),
            },
            memory: {
                rssMb: Number((memoryUsage.rss / 1024 / 1024).toFixed(3)),
                heapUsedMb: Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(3)),
            },
        };
    }
}
