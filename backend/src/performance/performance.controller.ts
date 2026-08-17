import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';

@Controller('performance')
export class PerformanceController {
    constructor(private readonly performanceService: PerformanceService) { }

    @Get('baseline')
    baseline() {
        return this.performanceService.runBaseline();
    }

    @Get('queue')
    queue(
        @Query('arrivalRate') arrivalRate?: string,
        @Query('processingCapacity') processingCapacity?: string,
        @Query('workers') workers?: string,
        @Query('durationSeconds') durationSeconds?: string,
    ) {
        return this.performanceService.runQueueSimulation({
            arrivalRate: Number(arrivalRate ?? 50),
            processingCapacity: Number(processingCapacity ?? 10),
            workers: Number(workers ?? 2),
            durationSeconds: Number(durationSeconds ?? 20),
        });
    }

    @Get('cpu')
    cpu(@Query('level') level?: string) {
        return this.performanceService.runCpuLatency(level ?? 'light');
    }

    @Get('network')
    network(@Query('delay') delay?: string) {
        return this.performanceService.runNetworkLatency(Number(delay ?? 200));
    }

    @Get('disk')
    disk(@Query('size') size?: string) {
        return this.performanceService.runDiskLatency(size ?? 'medium');
    }

    @Get('memory')
    memory(@Query('workload') workload?: string) {
        return this.performanceService.runMemoryLatency(workload ?? 'medium');
    }

    @Get('cache/user/:id')
    cacheUser(@Param('id') id: string, @Query('cache') cache?: string) {
        return this.performanceService.runCacheUserExperiment(Number(id), cache ?? 'on');
    }

    @Post('cache/clear')
    clearCache() {
        return this.performanceService.clearCacheExperiment();
    }
}
