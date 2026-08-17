import { PerformanceService } from '../src/performance/performance.service';

describe('PerformanceService scenarios', () => {
    const service = new PerformanceService();

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
});
