import { Controller, Get, Query } from '@nestjs/common';
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
}
