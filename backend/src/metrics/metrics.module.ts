import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { HttpMetricsMiddleware } from './http-metrics.middleware';

@Module({
    providers: [MetricsService],
    exports: [MetricsService],
})
export class MetricsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpMetricsMiddleware).forRoutes('*');
    }
}
