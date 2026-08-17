import { Controller, Get, Query } from '@nestjs/common';
import { LabService } from '../services/lab.service';

@Controller('lab')
export class LabController {
    constructor(private readonly labService: LabService) { }

    @Get('cpu')
    async cpu(@Query('ms') ms?: string) {
        const durationMs = Number(ms ?? 100);
        return this.labService.cpuBurn(durationMs);
    }

    @Get('latency')
    async latency(@Query('ms') ms?: string) {
        const durationMs = Number(ms ?? 100);
        return this.labService.simulateLatency(durationMs);
    }

    @Get('queue')
    async queue(@Query('jobs') jobs?: string, @Query('workers') workers?: string) {
        return this.labService.queueSimulation(Number(jobs ?? 20), Number(workers ?? 4));
    }

    @Get('scaling/amdahl')
    amdahl(@Query('p') p?: string, @Query('n') n?: string) {
        return this.labService.amdahl(Number(p ?? 0.9), Number(n ?? 4));
    }

    @Get('scaling/usl')
    usl(@Query('n') n?: string, @Query('alpha') alpha?: string, @Query('beta') beta?: string) {
        return this.labService.usl(Number(n ?? 8), Number(alpha ?? 0.02), Number(beta ?? 0.01));
    }

    @Get('db/indexing')
    async dbIndexing(@Query('indexed') indexed?: string) {
        return this.labService.dbIndexing(indexed === 'true');
    }

    @Get('cache/demo')
    async cacheDemo(@Query('key') key?: string) {
        return this.labService.cacheDemo(key ?? 'sample-key');
    }

    @Get('locks/contention')
    async lockContention(@Query('threads') threads?: string) {
        return this.labService.lockContention(Number(threads ?? 8));
    }
}
