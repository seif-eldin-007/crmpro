import { Injectable } from '@nestjs/common';
import {
  CleanupSchedulerHealthContributor,
  HealthStatus,
} from '../../common/health';
import { CleanupSchedulerService } from './cleanup-scheduler.service';

@Injectable()
export class CleanupSchedulerHealthProvider implements CleanupSchedulerHealthContributor {
  constructor(
    private readonly cleanupSchedulerService: CleanupSchedulerService,
  ) {}

  getSchedulerStatus(): HealthStatus {
    return this.cleanupSchedulerService.isRegistered() ? 'up' : 'down';
  }
}
