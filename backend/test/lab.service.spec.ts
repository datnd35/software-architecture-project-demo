import { LabService } from '../src/services/lab.service';
import { MetricsService } from '../src/services/metrics.service';
import { StorageService } from '../src/services/storage.service';

describe('LabService scaling models', () => {
    const service = new LabService(new MetricsService(), new StorageService());

    it('calculates Amdahl speedup', () => {
        const result = service.amdahl(0.9, 4);
        expect(result.speedup).toBeGreaterThan(3);
        expect(result.speedup).toBeLessThan(4);
    });

    it('calculates USL relative capacity', () => {
        const result = service.usl(8, 0.02, 0.01);
        expect(result.relativeCapacity).toBeGreaterThan(0);
        expect(result.relativeCapacity).toBeLessThan(8);
    });
});
