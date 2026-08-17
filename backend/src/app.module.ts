import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { MetricsModule } from './metrics/metrics.module';
import { PerformanceController } from './performance/performance.controller';
import { PerformanceService } from './performance/performance.service';
import { HealthService } from './services/health.service';
import { StorageService } from './services/storage.service';

@Module({
    imports: [MetricsModule],
    controllers: [AppController, PerformanceController],
    providers: [StorageService, HealthService, PerformanceService],
})
export class AppModule { }
