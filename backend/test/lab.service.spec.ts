import { PerformanceService } from '../src/performance/performance.service';

describe('PerformanceService scenarios', () => {
    const storageMock = {
        getCacheValue: jest.fn(async () => ({ value: null, latencyMs: 0.2 })),
        setCacheValue: jest.fn(async () => ({ latencyMs: 0.25 })),
        clearCacheByPrefix: jest.fn(async () => 0),
        getUserById: jest.fn(async (id: number) => ({
            user: { id, name: `User ${id}`, email: `user${id}@pel.local` },
            latencyMs: 1,
        })),
    };

    const metricsMock = {
        observeRedisLatency: jest.fn(),
        observeDatabaseLatency: jest.fn(),
        observeTotalRequestLatency: jest.fn(),
        recordCacheHit: jest.fn(),
        recordCacheMiss: jest.fn(),
        recordDatabaseQuery: jest.fn(),
        resetCacheStats: jest.fn(),
        getCacheStats: jest.fn(() => ({
            cache_hits_total: 0,
            cache_misses_total: 1,
            cache_hit_rate: 0,
            database_queries: 1,
        })),
    };

    const service = new PerformanceService(storageMock as never, metricsMock as never);

    it('runs cpu scenario with valid level', () => {
        const result = service.runCpuLatency('medium');
        expect(result.scenario).toBe('cpu-latency');
        expect(result.processingTime).toBeGreaterThan(0);
    });

    it('runs network scenario with allowed delay bucket', async () => {
        const result = await service.runNetworkLatency(210);
        expect(result.scenario).toBe('network-latency');
        expect([0, 50, 100, 200, 500, 1000]).toContain(result.delay);
    });

    it('runs disk scenario and returns bounded metrics', async () => {
        const result = await service.runDiskLatency('small');
        expect(result.scenario).toBe('disk-latency');
        expect(result.processingTime).toBeGreaterThan(0);
    });

    it('runs memory scenario and returns throughput', () => {
        const result = service.runMemoryLatency('medium');
        expect(result.scenario).toBe('memory-latency');
        expect(result.throughput).toBeGreaterThan(0);
    });

    it('runs caching scenario and returns db source on miss', async () => {
        const result = await service.runCacheUserExperiment(7, 'on');
        expect(result.scenario).toBe('caching');
        expect(result.source).toBe('database');
        expect(result.user.id).toBe(7);
    });
});
