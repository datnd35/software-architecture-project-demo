import { Injectable } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { StorageService } from './storage.service';

@Injectable()
export class LabService {
    constructor(
        private readonly metrics: MetricsService,
        private readonly storage: StorageService,
    ) { }

    async cpuBurn(ms: number) {
        const duration = this.normalize(ms, 1, 5000);
        const started = performance.now();
        while (performance.now() - started < duration) {
            Math.sqrt(Math.random() * 1000);
        }
        const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
        this.metrics.count('cpu_burn');
        this.metrics.observeLatency('cpu_burn', elapsedMs);
        return { concept: 'cpu_latency', requestedMs: duration, elapsedMs };
    }

    async simulateLatency(ms: number) {
        const duration = this.normalize(ms, 1, 10000);
        const started = performance.now();
        await new Promise((resolve) => setTimeout(resolve, duration));
        const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
        this.metrics.count('injected_latency');
        this.metrics.observeLatency('injected_latency', elapsedMs);
        return { concept: 'latency', requestedMs: duration, elapsedMs };
    }

    async queueSimulation(jobs: number, workers: number) {
        const safeJobs = this.normalize(jobs, 1, 500);
        const safeWorkers = this.normalize(workers, 1, 64);
        const queue = Array.from({ length: safeJobs }, (_, i) => i + 1);
        const started = performance.now();
        this.metrics.setQueueDepth(queue.length);

        const runWorker = async () => {
            while (queue.length > 0) {
                queue.shift();
                this.metrics.setQueueDepth(queue.length);
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        };

        await Promise.all(Array.from({ length: safeWorkers }, () => runWorker()));
        const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
        const throughput = Math.round((safeJobs / (elapsedMs / 1000)) * 100) / 100;

        this.metrics.count('queue_simulation');
        this.metrics.observeLatency('queue_simulation', elapsedMs);
        this.metrics.setQueueDepth(0);

        return {
            concept: 'queue_buildup_and_throughput',
            jobs: safeJobs,
            workers: safeWorkers,
            elapsedMs,
            throughputJobsPerSec: throughput,
        };
    }

    amdahl(parallelFraction: number, cores: number) {
        const p = Math.min(Math.max(parallelFraction, 0), 1);
        const n = this.normalize(cores, 1, 1024);
        const speedup = 1 / ((1 - p) + p / n);
        const efficiency = speedup / n;
        this.metrics.count('amdahl');
        return {
            concept: 'amdahl_law',
            parallelFraction: p,
            cores: n,
            speedup: Number(speedup.toFixed(4)),
            efficiency: Number(efficiency.toFixed(4)),
        };
    }

    usl(n: number, alpha: number, beta: number) {
        const threads = this.normalize(n, 1, 1024);
        const a = Math.max(alpha, 0);
        const b = Math.max(beta, 0);
        const denominator = 1 + a * (threads - 1) + b * threads * (threads - 1);
        const capacity = threads / denominator;
        this.metrics.count('usl');
        return {
            concept: 'universal_scalability_law',
            threads,
            alpha: a,
            beta: b,
            relativeCapacity: Number(capacity.toFixed(4)),
        };
    }

    dbIndexing(indexed: boolean) {
        this.metrics.count('db_indexing');
        return this.storage.dbIndexing(indexed);
    }

    async cacheDemo(key: string) {
        const result = await this.storage.cacheDemo(key);
        this.metrics.count('cache_demo');
        this.metrics.observeLatency('cache_demo', result.elapsedMs);
        return result;
    }

    async lockContention(threads: number) {
        const t = this.normalize(threads, 1, 64);
        let lock = false;
        let casRetries = 0;
        let completed = 0;

        const spin = async () => {
            while (lock) {
                casRetries += 1;
                await new Promise((resolve) => setTimeout(resolve, 1));
            }
            lock = true;
            await new Promise((resolve) => setTimeout(resolve, 5));
            completed += 1;
            lock = false;
        };

        const started = performance.now();
        await Promise.all(Array.from({ length: t }, () => spin()));
        const elapsedMs = Math.round((performance.now() - started) * 100) / 100;

        this.metrics.count('lock_contention');
        this.metrics.observeLatency('lock_contention', elapsedMs);

        return {
            concept: 'lock_contention_and_cas',
            threads: t,
            completed,
            casRetries,
            elapsedMs,
            notes: 'Synthetic contention simulation for educational purpose',
        };
    }

    private normalize(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(Math.max(Math.floor(value), min), max);
    }
}
