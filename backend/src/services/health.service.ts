import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from './storage.service';

@Injectable()
export class HealthService {
    constructor(private readonly storageService: StorageService) { }

    async check(): Promise<{ status: 'ok' }> {
        const [postgresOk, redisOk] = await Promise.all([
            this.storageService.checkPostgres(),
            this.storageService.checkRedis(),
        ]);

        if (!postgresOk || !redisOk) {
            throw new ServiceUnavailableException({
                status: 'error',
                postgres: postgresOk ? 'up' : 'down',
                redis: redisOk ? 'up' : 'down',
            });
        }

        return { status: 'ok' };
    }
}
