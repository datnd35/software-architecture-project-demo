import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { LabController } from './controllers/lab.controller';
import { LabService } from './services/lab.service';
import { MetricsService } from './services/metrics.service';
import { StorageService } from './services/storage.service';

@Module({
    imports: [],
    controllers: [AppController, LabController],
    providers: [LabService, MetricsService, StorageService],
})
export class AppModule { }
