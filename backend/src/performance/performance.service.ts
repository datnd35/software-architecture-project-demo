import { Injectable } from '@nestjs/common';

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

@Injectable()
export class PerformanceService {
    private readonly startedAt = Date.now();
    private readonly durationsMs: number[] = [];
    private readonly maxSamples = 5000;
    private requestCount = 0;

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
}
