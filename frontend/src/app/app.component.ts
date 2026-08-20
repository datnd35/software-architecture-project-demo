import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ScenarioSelectorComponent } from './components/scenario-selector/scenario-selector.component';
import { StatusItemComponent } from './components/status-item/status-item.component';
import { MetricCardComponent } from './components/metric-card/metric-card.component';
import { ChartPanelComponent } from './components/chart-panel/chart-panel.component';
import { ChartItem, MetricItem, ScenarioOption, SystemStatusItem } from './models/dashboard.model';

type BaselineApiResponse = {
    scenario: 'baseline';
    processingTimeMs: number;
    timestamp: string;
    metrics: {
        requestCount: number;
        throughput: number;
        p50: number;
        p95: number;
        p99: number;
        averageLatencyMs: number;
    };
};

type QueueApiResponse = {
    scenario: 'queue-buildup';
    config: {
        arrivalRate: number;
        processingCapacity: number;
        workers: number;
        durationSeconds: number;
    };
    metrics: {
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
    timeline: {
        incoming: number[];
        queueSize: number[];
        activeWorkers: number[];
    };
    explanation: string;
    timestamp: string;
};

type ScenarioCoreResponse = {
    scenario: string;
    processingTime: number;
    totalLatency: number;
    throughput: number;
    cpu: {
        userMs: number;
        systemMs: number;
        totalMs: number;
    };
    memory: {
        rssMb: number;
        heapUsedMb: number;
    };
    timestamp: string;
};

type CacheApiResponse = {
    scenario: 'caching';
    cacheStatus: 'ON' | 'OFF';
    source: 'redis' | 'database';
    user: { id: number; name: string; email: string };
    ttlSeconds: number;
    processingTime: number;
    totalLatency: number;
    throughput: number;
    cpu: {
        userMs: number;
        systemMs: number;
        totalMs: number;
    };
    memory: {
        rssMb: number;
        heapUsedMb: number;
    };
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
};

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [NgFor, NgIf, ScenarioSelectorComponent, StatusItemComponent, MetricCardComponent, ChartPanelComponent],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private queueAnimationTimer: ReturnType<typeof setInterval> | null = null;

    readonly title = 'Performance Engineering Lab';

    readonly scenarios = signal<ScenarioOption[]>([
        { id: 'baseline', label: 'Baseline', enabled: true },
        { id: 'queue-buildup', label: 'Queue Buildup', enabled: true },
        { id: 'cpu-latency', label: 'CPU Latency', enabled: true },
        { id: 'network-latency', label: 'Network Latency', enabled: true },
        { id: 'disk-latency', label: 'Disk Latency', enabled: true },
        { id: 'memory-latency', label: 'Memory Latency', enabled: true },
        { id: 'database-index', label: 'Database Index', enabled: false },
        { id: 'caching', label: 'Caching', enabled: true },
        { id: 'concurrency', label: 'Concurrency', enabled: false },
        { id: 'lock-contention', label: 'Lock Contention', enabled: false },
        { id: 'cas', label: 'CAS', enabled: false },
        { id: 'deadlock', label: 'Deadlock', enabled: false },
        { id: 'amdahl', label: "Amdahl's Law", enabled: false },
        { id: 'usl', label: 'Universal Scalability Law', enabled: false },
        { id: 'capacity', label: 'Capacity', enabled: false },
    ]);

    readonly selectedScenarioId = signal('baseline');
    readonly selectedScenario = computed(
        () => this.scenarios().find((s) => s.id === this.selectedScenarioId()) ?? this.scenarios()[0],
    );
    readonly isComingSoon = computed(() => !this.selectedScenario().enabled);
    readonly isBaselineSelected = computed(() => this.selectedScenarioId() === 'baseline');
    readonly isQueueScenarioSelected = computed(() => this.selectedScenarioId() === 'queue-buildup');
    readonly isCpuScenarioSelected = computed(() => this.selectedScenarioId() === 'cpu-latency');
    readonly isNetworkScenarioSelected = computed(() => this.selectedScenarioId() === 'network-latency');
    readonly isDiskScenarioSelected = computed(() => this.selectedScenarioId() === 'disk-latency');
    readonly isMemoryScenarioSelected = computed(() => this.selectedScenarioId() === 'memory-latency');
    readonly isCachingScenarioSelected = computed(() => this.selectedScenarioId() === 'caching');

    readonly systemStatus = signal<SystemStatusItem[]>([
        { label: 'Backend', healthy: true },
        { label: 'PostgreSQL', healthy: true },
        { label: 'Redis', healthy: true },
    ]);

    readonly metrics = signal<MetricItem[]>([
        { label: 'Requests/sec', value: '-' },
        { label: 'p50', value: '-' },
        { label: 'p95', value: '-' },
        { label: 'p99', value: '-' },
        { label: 'Average latency', value: '-' },
    ]);

    readonly baselineInfo = signal<{ processingTimeMs: number; timestamp: string } | null>(null);
    readonly queueInfo = signal<{ timestamp: string; explanation: string } | null>(null);
    readonly runInProgress = signal(false);
    readonly scenarioInfo = signal<{ title: string; text: string; timestamp: string } | null>(null);

    readonly cpuLevel = signal<'light' | 'medium' | 'heavy' | 'extreme'>('light');
    readonly networkDelay = signal(200);
    readonly diskSize = signal<'small' | 'medium' | 'large'>('medium');
    readonly memoryWorkload = signal<'small' | 'medium' | 'large'>('medium');
    readonly cacheMode = signal<'on' | 'off'>('on');
    readonly cacheUserId = signal(1);
    readonly cacheLastSource = signal<'redis' | 'database' | '-'>('-');
    readonly cacheLastUser = signal<{ id: number; name: string; email: string } | null>(null);

    readonly arrivalRate = signal(80);
    readonly processingCapacity = signal(12);
    readonly workerCount = signal(2);

    readonly queueLiveSize = signal(0);
    readonly queueLiveWorkers = signal(0);
    readonly queueLiveIncoming = signal(0);
    readonly queueFillRatio = signal(0);

    readonly charts = signal<ChartItem[]>([
        { title: 'Latency', subtitle: 'Simple baseline trend', points: [25, 35, 40, 48, 42, 52, 46, 50] },
        { title: 'Throughput', subtitle: 'Requests per second trend', points: [30, 36, 43, 50, 57, 54, 60, 62] },
        { title: 'Queue Size', subtitle: 'In-flight queue depth', points: [10, 12, 15, 18, 14, 16, 12, 9] },
    ]);

    ngOnInit(): void {
        this.http.get<{ status?: string; postgres?: string; redis?: string }>('/api/health').subscribe({
            next: (res) => {
                const backendUp = res.status === 'ok';
                const postgresUp = res.postgres ? res.postgres === 'up' : backendUp;
                const redisUp = res.redis ? res.redis === 'up' : backendUp;

                this.systemStatus.set([
                    { label: 'Backend', healthy: backendUp },
                    { label: 'PostgreSQL', healthy: postgresUp },
                    { label: 'Redis', healthy: redisUp },
                ]);
            },
            error: (err: HttpErrorResponse) => {
                const payload =
                    typeof err.error === 'object' && err.error !== null
                        ? (err.error as { status?: string; postgres?: string; redis?: string })
                        : null;

                if (payload) {
                    const backendUp = err.status > 0;
                    this.systemStatus.set([
                        { label: 'Backend', healthy: backendUp },
                        { label: 'PostgreSQL', healthy: payload.postgres === 'up' },
                        { label: 'Redis', healthy: payload.redis === 'up' },
                    ]);
                    return;
                }

                this.systemStatus.set([
                    { label: 'Backend', healthy: false },
                    { label: 'PostgreSQL', healthy: false },
                    { label: 'Redis', healthy: false },
                ]);
            },
        });
    }

    onScenarioChange(id: string): void {
        this.selectedScenarioId.set(id);
        this.scenarioInfo.set(null);
        if (id === 'baseline') {
            this.metrics.set([
                { label: 'Requests/sec', value: '-' },
                { label: 'p50', value: '-' },
                { label: 'p95', value: '-' },
                { label: 'p99', value: '-' },
                { label: 'Average latency', value: '-' },
            ]);
        }

        if (id === 'queue-buildup') {
            this.metrics.set([
                { label: 'Queue Size', value: '-' },
                { label: 'Active Workers', value: '-' },
                { label: 'Throughput', value: '-' },
                { label: 'p50', value: '-' },
                { label: 'p95', value: '-' },
                { label: 'p99', value: '-' },
                { label: 'Waiting Time', value: '-' },
                { label: 'Processing Time', value: '-' },
            ]);
        }

        if (id === 'cpu-latency' || id === 'network-latency' || id === 'disk-latency' || id === 'memory-latency') {
            this.metrics.set([
                { label: 'Processing Time', value: '-' },
                { label: 'Total Latency', value: '-' },
                { label: 'Throughput', value: '-' },
                { label: 'CPU', value: '-' },
                { label: 'Memory', value: '-' },
            ]);
        }

        if (id === 'caching') {
            this.metrics.set([
                { label: 'Cache Status', value: '-' },
                { label: 'Cache Hit Rate', value: '-' },
                { label: 'Cache Hits', value: '-' },
                { label: 'Cache Misses', value: '-' },
                { label: 'DB Queries', value: '-' },
                { label: 'Latency', value: '-' },
            ]);
        }
    }

    runBaselineTest(): void {
        if (!this.isBaselineSelected()) {
            return;
        }

        this.runInProgress.set(true);
        this.http.get<BaselineApiResponse>('/api/performance/baseline').subscribe({
            next: (res) => {
                this.metrics.set([
                    { label: 'Requests/sec', value: String(res.metrics.throughput) },
                    { label: 'p50', value: `${res.metrics.p50} ms` },
                    { label: 'p95', value: `${res.metrics.p95} ms` },
                    { label: 'p99', value: `${res.metrics.p99} ms` },
                    { label: 'Average latency', value: `${res.metrics.averageLatencyMs} ms` },
                ]);
                this.baselineInfo.set({
                    processingTimeMs: res.processingTimeMs,
                    timestamp: res.timestamp,
                });
                this.runInProgress.set(false);
            },
            error: () => {
                this.metrics.set([
                    { label: 'Requests/sec', value: 'N/A' },
                    { label: 'p50', value: 'N/A' },
                    { label: 'p95', value: 'N/A' },
                    { label: 'p99', value: 'N/A' },
                    { label: 'Average latency', value: 'N/A' },
                ]);
                this.runInProgress.set(false);
            },
        });
    }

    runQueueTest(): void {
        if (!this.isQueueScenarioSelected()) {
            return;
        }

        this.clearQueueAnimation();
        this.runInProgress.set(true);

        const url =
            `/api/performance/queue?arrivalRate=${this.arrivalRate()}` +
            `&processingCapacity=${this.processingCapacity()}` +
            `&workers=${this.workerCount()}`;

        this.http.get<QueueApiResponse>(url).subscribe({
            next: (res) => {
                this.metrics.set([
                    { label: 'Queue Size', value: String(res.metrics.queue_size) },
                    { label: 'Active Workers', value: String(res.metrics.active_workers) },
                    { label: 'Throughput', value: `${res.metrics.throughput} req/s` },
                    { label: 'p50', value: `${res.metrics.p50} ms` },
                    { label: 'p95', value: `${res.metrics.p95} ms` },
                    { label: 'p99', value: `${res.metrics.p99} ms` },
                    { label: 'Waiting Time', value: `${res.metrics.waiting_time} ms` },
                    { label: 'Processing Time', value: `${res.metrics.processing_time} ms` },
                ]);

                this.queueInfo.set({
                    timestamp: res.timestamp,
                    explanation: res.explanation,
                });

                const queuePoints = this.normalizeForChart(res.timeline.queueSize);
                const throughputPoints = this.normalizeForChart(
                    res.timeline.activeWorkers.map((workers) => workers * res.config.processingCapacity),
                );
                const waitingPoints = this.normalizeForChart(
                    res.timeline.queueSize.map((q) => q * (1000 / res.config.processingCapacity)),
                );

                this.charts.set([
                    { title: 'Queue Size', subtitle: 'Queue growth over simulation', points: queuePoints },
                    { title: 'Throughput', subtitle: 'Estimated processing rate', points: throughputPoints },
                    { title: 'Waiting Time', subtitle: 'Queue-induced waiting trend', points: waitingPoints },
                ]);

                this.animateQueue(res.timeline.queueSize, res.timeline.activeWorkers, res.timeline.incoming);
                this.runInProgress.set(false);
            },
            error: () => {
                this.metrics.set([
                    { label: 'Queue Size', value: 'N/A' },
                    { label: 'Active Workers', value: 'N/A' },
                    { label: 'Throughput', value: 'N/A' },
                    { label: 'p50', value: 'N/A' },
                    { label: 'p95', value: 'N/A' },
                    { label: 'p99', value: 'N/A' },
                    { label: 'Waiting Time', value: 'N/A' },
                    { label: 'Processing Time', value: 'N/A' },
                ]);
                this.runInProgress.set(false);
            },
        });
    }

    runCpuTest(): void {
        if (!this.isCpuScenarioSelected()) {
            return;
        }
        this.runInProgress.set(true);
        this.http.get<ScenarioCoreResponse & { level: string }>(`/api/performance/cpu?level=${this.cpuLevel()}`).subscribe({
            next: (res) => {
                this.applyCoreMetrics(res);
                this.scenarioInfo.set({
                    title: 'CPU Latency',
                    text: 'CPU workload increases processing time as compute intensity rises.',
                    timestamp: res.timestamp,
                });
                this.runInProgress.set(false);
            },
            error: () => {
                this.applyUnavailableCoreMetrics();
                this.runInProgress.set(false);
            },
        });
    }

    runNetworkTest(): void {
        if (!this.isNetworkScenarioSelected()) {
            return;
        }
        this.runInProgress.set(true);
        this.http
            .get<ScenarioCoreResponse & { delay: number }>(`/api/performance/network?delay=${this.networkDelay()}`)
            .subscribe({
                next: (res) => {
                    this.applyCoreMetrics(res);
                    this.scenarioInfo.set({
                        title: 'Network Latency',
                        text: 'Artificial delay is injected to simulate network transit and downstream waiting.',
                        timestamp: res.timestamp,
                    });
                    this.runInProgress.set(false);
                },
                error: () => {
                    this.applyUnavailableCoreMetrics();
                    this.runInProgress.set(false);
                },
            });
    }

    runDiskTest(): void {
        if (!this.isDiskScenarioSelected()) {
            return;
        }
        this.runInProgress.set(true);
        this.http
            .get<ScenarioCoreResponse & { size: string }>(`/api/performance/disk?size=${this.diskSize()}`)
            .subscribe({
                next: (res) => {
                    this.applyCoreMetrics(res);
                    this.scenarioInfo.set({
                        title: 'Disk Latency',
                        text: 'Temporary file write/read cost is measured to model storage latency.',
                        timestamp: res.timestamp,
                    });
                    this.runInProgress.set(false);
                },
                error: () => {
                    this.applyUnavailableCoreMetrics();
                    this.runInProgress.set(false);
                },
            });
    }

    runMemoryTest(): void {
        if (!this.isMemoryScenarioSelected()) {
            return;
        }
        this.runInProgress.set(true);
        this.http
            .get<ScenarioCoreResponse & { workload: string }>(
                `/api/performance/memory?workload=${this.memoryWorkload()}`,
            )
            .subscribe({
                next: (res) => {
                    this.applyCoreMetrics(res);
                    this.scenarioInfo.set({
                        title: 'Memory Latency',
                        text: 'Bounded in-memory allocation and traversal show memory pressure effects.',
                        timestamp: res.timestamp,
                    });
                    this.runInProgress.set(false);
                },
                error: () => {
                    this.applyUnavailableCoreMetrics();
                    this.runInProgress.set(false);
                },
            });
    }

    runCacheTest(): void {
        if (!this.isCachingScenarioSelected()) {
            return;
        }

        this.runInProgress.set(true);
        const url = `/api/performance/cache/user/${this.cacheUserId()}?cache=${this.cacheMode()}`;
        this.http.get<CacheApiResponse>(url).subscribe({
            next: (res) => {
                this.metrics.set([
                    { label: 'Cache Status', value: res.cacheStatus },
                    { label: 'Cache Hit Rate', value: `${(res.metrics.cache_hit_rate * 100).toFixed(2)}%` },
                    { label: 'Cache Hits', value: String(res.metrics.cache_hits_total) },
                    { label: 'Cache Misses', value: String(res.metrics.cache_misses_total) },
                    { label: 'DB Queries', value: String(res.metrics.database_queries) },
                    { label: 'Latency', value: `${res.metrics.total_request_latency} ms` },
                ]);

                this.cacheLastSource.set(res.source);
                this.cacheLastUser.set(res.user);
                this.scenarioInfo.set({
                    title: 'Caching',
                    text: `Source: ${res.source.toUpperCase()} · Redis latency: ${res.metrics.redis_latency} ms · DB latency: ${res.metrics.database_latency} ms`,
                    timestamp: res.timestamp,
                });

                this.runInProgress.set(false);
            },
            error: () => {
                this.metrics.set([
                    { label: 'Cache Status', value: 'N/A' },
                    { label: 'Cache Hit Rate', value: 'N/A' },
                    { label: 'Cache Hits', value: 'N/A' },
                    { label: 'Cache Misses', value: 'N/A' },
                    { label: 'DB Queries', value: 'N/A' },
                    { label: 'Latency', value: 'N/A' },
                ]);
                this.runInProgress.set(false);
            },
        });
    }

    clearCache(): void {
        this.runInProgress.set(true);
        this.http.post<{ status: string; clearedKeys: number; timestamp: string }>('/api/performance/cache/clear', {}).subscribe({
            next: (res) => {
                this.scenarioInfo.set({
                    title: 'Caching',
                    text: `Cache cleared: ${res.clearedKeys} keys removed`,
                    timestamp: res.timestamp,
                });
                this.cacheLastSource.set('-');
                this.cacheLastUser.set(null);
                this.metrics.set([
                    { label: 'Cache Status', value: this.cacheMode().toUpperCase() },
                    { label: 'Cache Hit Rate', value: '0.00%' },
                    { label: 'Cache Hits', value: '0' },
                    { label: 'Cache Misses', value: '0' },
                    { label: 'DB Queries', value: '0' },
                    { label: 'Latency', value: '-' },
                ]);
                this.runInProgress.set(false);
            },
            error: () => {
                this.runInProgress.set(false);
            },
        });
    }

    setCacheMode(value: string): void {
        if (value === 'on' || value === 'off') {
            this.cacheMode.set(value);
        }
    }

    setCacheUserId(value: string): void {
        this.cacheUserId.set(this.parsePositiveInt(value, 1));
    }

    setCpuLevel(value: string): void {
        if (value === 'light' || value === 'medium' || value === 'heavy' || value === 'extreme') {
            this.cpuLevel.set(value);
        }
    }

    setNetworkDelay(value: string): void {
        this.networkDelay.set(this.parsePositiveInt(value, 200));
    }

    setDiskSize(value: string): void {
        if (value === 'small' || value === 'medium' || value === 'large') {
            this.diskSize.set(value);
        }
    }

    setMemoryWorkload(value: string): void {
        if (value === 'small' || value === 'medium' || value === 'large') {
            this.memoryWorkload.set(value);
        }
    }

    setArrivalRate(value: string): void {
        this.arrivalRate.set(this.parsePositiveInt(value, 80));
    }

    setProcessingCapacity(value: string): void {
        this.processingCapacity.set(this.parsePositiveInt(value, 12));
    }

    setWorkerCount(value: string): void {
        this.workerCount.set(this.parsePositiveInt(value, 2));
    }

    private animateQueue(queue: number[], workers: number[], incoming: number[]): void {
        if (queue.length === 0) {
            this.queueLiveSize.set(0);
            this.queueLiveWorkers.set(0);
            this.queueLiveIncoming.set(0);
            this.queueFillRatio.set(0);
            return;
        }

        const maxQueue = Math.max(...queue, 1);
        let index = 0;

        this.queueAnimationTimer = setInterval(() => {
            const q = queue[index] ?? queue[queue.length - 1];
            const w = workers[index] ?? workers[workers.length - 1];
            const inReq = incoming[index] ?? incoming[incoming.length - 1];

            this.queueLiveSize.set(q);
            this.queueLiveWorkers.set(w);
            this.queueLiveIncoming.set(inReq);
            this.queueFillRatio.set(Math.min(100, Math.round((q / maxQueue) * 100)));

            index += 1;
            if (index >= queue.length) {
                this.clearQueueAnimation();
            }
        }, 120);
    }

    private clearQueueAnimation(): void {
        if (this.queueAnimationTimer) {
            clearInterval(this.queueAnimationTimer);
            this.queueAnimationTimer = null;
        }
    }

    private normalizeForChart(values: number[]): number[] {
        if (values.length === 0) {
            return [0];
        }
        const sampleSize = Math.min(values.length, 8);
        const bucketSize = Math.max(1, Math.floor(values.length / sampleSize));
        const sampled: number[] = [];

        for (let i = 0; i < values.length && sampled.length < sampleSize; i += bucketSize) {
            sampled.push(values[i]);
        }

        while (sampled.length < sampleSize) {
            sampled.push(sampled[sampled.length - 1] ?? 0);
        }

        const maxValue = Math.max(...sampled, 1);
        return sampled.map((value) => Math.max(4, Math.round((value / maxValue) * 100)));
    }

    private parsePositiveInt(value: string, fallback: number): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }
        return Math.floor(parsed);
    }

    private applyCoreMetrics(res: ScenarioCoreResponse): void {
        this.metrics.set([
            { label: 'Processing Time', value: `${res.processingTime} ms` },
            { label: 'Total Latency', value: `${res.totalLatency} ms` },
            { label: 'Throughput', value: `${res.throughput} req/s` },
            { label: 'CPU', value: `${res.cpu.totalMs} ms (u:${res.cpu.userMs}, s:${res.cpu.systemMs})` },
            { label: 'Memory', value: `${res.memory.heapUsedMb} MB heap / ${res.memory.rssMb} MB rss` },
        ]);
    }

    private applyUnavailableCoreMetrics(): void {
        this.metrics.set([
            { label: 'Processing Time', value: 'N/A' },
            { label: 'Total Latency', value: 'N/A' },
            { label: 'Throughput', value: 'N/A' },
            { label: 'CPU', value: 'N/A' },
            { label: 'Memory', value: 'N/A' },
        ]);
    }
}
