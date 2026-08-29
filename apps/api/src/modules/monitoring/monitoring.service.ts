import { Inject, Injectable } from '@nestjs/common';
import {
  CLEANUP_HEALTH_PROVIDER,
  JOBS_HEALTH_PROVIDER,
} from '../../common/health';
import type {
  CleanupHealthProvider,
  JobsHealthProvider,
} from '../../common/health';
import {
  GlobalHealthData,
  JobsHealthData,
  MetricsData,
} from './monitoring.types';
import { HealthCheckService } from './health/health-check.service';
import { MetricsService } from './metrics/metrics.service';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    @Inject(JOBS_HEALTH_PROVIDER)
    private readonly jobsHealthProvider: JobsHealthProvider,
    @Inject(CLEANUP_HEALTH_PROVIDER)
    private readonly cleanupHealthProvider: CleanupHealthProvider,
    private readonly metricsService: MetricsService,
  ) {}

  getGlobalHealth(): Promise<GlobalHealthData> {
    return this.healthCheckService.getGlobalHealth();
  }

  async getJobsHealth(): Promise<JobsHealthData> {
    const [jobs, cleanup] = await Promise.all([
      this.jobsHealthProvider.getHealth(),
      Promise.resolve(this.cleanupHealthProvider.getJobsHealthSummary()),
    ]);

    return {
      ...jobs,
      cleanup,
    };
  }

  getMetrics(): Promise<MetricsData> {
    return this.metricsService.getMetrics();
  }

  async getSnapshot(): Promise<{
    health: Awaited<ReturnType<MonitoringService['getGlobalHealth']>>;
    jobs: Awaited<ReturnType<MonitoringService['getJobsHealth']>>;
    metrics: Awaited<ReturnType<MonitoringService['getMetrics']>>;
  }> {
    const [health, jobs, metrics] = await Promise.all([
      this.getGlobalHealth(),
      this.getJobsHealth(),
      this.getMetrics(),
    ]);

    return { health, jobs, metrics };
  }
}
