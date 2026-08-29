import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus } from '@crmpro/database';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  HealthStatus,
  JobStatusCounts,
  QueueMetricsSnapshot,
  SystemHealthData,
  SystemHttpMetrics,
  SystemNotificationMetrics,
  SystemQueueSnapshot,
  TenantApiHealth,
  WorkerHealthMap,
} from './system.types';

const EMPTY_JOB_COUNTS: JobStatusCounts = {
  PENDING: 0,
  PROCESSING: 0,
  COMPLETED: 0,
  FAILED: 0,
  PARTIAL_SUCCESS: 0,
};

const EMPTY_QUEUE_COUNTS: QueueMetricsSnapshot = {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
};

const UNKNOWN_WORKERS: WorkerHealthMap = {
  import: 'unknown',
  export: 'unknown',
  cleanup: 'unknown',
  notification: 'unknown',
};

interface TenantPublicHealth {
  api: HealthStatus;
  database: HealthStatus;
  redis: HealthStatus;
  storage: HealthStatus;
  queues: 'healthy' | 'unhealthy';
  cleanupScheduler: HealthStatus;
  version: string;
  environment: string;
  uptimeSeconds: number;
}

interface TenantSnapshot {
  health: TenantPublicHealth;
  jobs: {
    redis: HealthStatus;
    queues: 'healthy' | 'unhealthy';
    workers: {
      import: 'running' | 'stopped';
      export: 'running' | 'stopped';
      cleanup: 'running' | 'stopped';
      notification: 'running' | 'stopped';
    };
    cleanup: { lastRun: string | null; status: 'healthy' | 'degraded' };
  };
  metrics: {
    http: SystemHttpMetrics;
    queues: {
      import: QueueMetricsSnapshot;
      export: QueueMetricsSnapshot;
      cleanup: QueueMetricsSnapshot;
      notification: QueueMetricsSnapshot;
    };
    notifications: SystemNotificationMetrics;
    workers: {
      import: 'running' | 'stopped';
      export: 'running' | 'stopped';
      cleanup: 'running' | 'stopped';
      notification: 'running' | 'stopped';
    };
  };
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getHealth(): Promise<SystemHealthData> {
    const [database, redis, tenantProbe, snapshot, jobs] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.probeTenantApi(),
      this.fetchTenantSnapshot(),
      this.getJobsSnapshot(),
    ]);

    const version = this.configService.get<string>('app.version') ?? '1.0.0';
    const environment =
      this.configService.get<string>('app.nodeEnv') ?? 'development';
    const uptimeSeconds = Math.floor(process.uptime());

    const tenantApi = this.mergeTenantHealth(tenantProbe, snapshot);
    const queues = this.buildQueues(snapshot);
    const workers = this.buildWorkers(snapshot);
    const cleanup = snapshot
      ? {
          lastRun: snapshot.jobs.cleanup.lastRun,
          status: snapshot.jobs.cleanup.status as
            | 'healthy'
            | 'degraded'
            | 'unknown',
        }
      : { lastRun: null, status: 'unknown' as const };

    const metricsAvailable = Boolean(snapshot);
    const metrics = {
      available: metricsAvailable,
      http: snapshot?.metrics.http ?? null,
      notifications: snapshot?.metrics.notifications ?? null,
    };

    const degraded =
      database === 'down' ||
      redis === 'down' ||
      tenantApi.status === 'down' ||
      queues.status === 'unhealthy' ||
      jobs.stuckImports > 0 ||
      jobs.stuckExports > 0 ||
      (metrics.http != null && metrics.http.errorRate >= 0.05) ||
      Object.values(workers).some((status) => status === 'stopped');

    return {
      status: degraded ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      api: 'up',
      database,
      redis,
      version,
      environment,
      uptimeSeconds,
      adminApi: {
        status: 'up',
        database,
        redis,
        version,
        environment,
        uptimeSeconds,
      },
      tenantApi,
      queues,
      workers,
      cleanup,
      jobs,
      metrics,
    };
  }

  private async checkDatabase(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<HealthStatus> {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      return 'not_configured';
    }

    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      client.disconnect();
    }
  }

  private async probeTenantApi(): Promise<{
    status: HealthStatus;
    probeLatencyMs: number | null;
    health: TenantPublicHealth | null;
  }> {
    const baseUrl = this.configService.get<string>('tenantApi.baseUrl');
    if (!baseUrl) {
      return { status: 'not_configured', probeLatencyMs: null, health: null };
    }

    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });
      const probeLatencyMs = Date.now() - started;
      if (!response.ok) {
        return { status: 'down', probeLatencyMs, health: null };
      }

      const json = (await response.json()) as {
        success?: boolean;
        data?: TenantPublicHealth;
      };
      if (!json.data) {
        return { status: 'down', probeLatencyMs, health: null };
      }

      return { status: 'up', probeLatencyMs, health: json.data };
    } catch (error) {
      this.logger.warn(
        `Tenant API health probe failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return {
        status: 'down',
        probeLatencyMs: Date.now() - started,
        health: null,
      };
    }
  }

  private async fetchTenantSnapshot(): Promise<TenantSnapshot | null> {
    const baseUrl = this.configService.get<string>('tenantApi.baseUrl');
    const internalKey = this.configService.get<string>(
      'tenantApi.internalMonitoringKey',
    );
    if (!baseUrl || !internalKey) {
      return null;
    }

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/internal/monitoring/snapshot`,
        {
          method: 'GET',
          headers: {
            'x-internal-monitoring-key': internalKey,
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `Tenant monitoring snapshot returned ${response.status}`,
        );
        return null;
      }

      const json = (await response.json()) as {
        success?: boolean;
        data?: TenantSnapshot;
      };
      return json.data ?? null;
    } catch (error) {
      this.logger.warn(
        `Tenant monitoring snapshot failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return null;
    }
  }

  private mergeTenantHealth(
    probe: {
      status: HealthStatus;
      probeLatencyMs: number | null;
      health: TenantPublicHealth | null;
    },
    snapshot: TenantSnapshot | null,
  ): TenantApiHealth {
    const health = snapshot?.health ?? probe.health;
    return {
      status: probe.status,
      probeLatencyMs: probe.probeLatencyMs,
      database: health?.database ?? null,
      redis: health?.redis ?? null,
      storage: health?.storage ?? null,
      queues: health?.queues ?? null,
      cleanupScheduler: health?.cleanupScheduler ?? null,
      version: health?.version ?? null,
      environment: health?.environment ?? null,
      uptimeSeconds: health?.uptimeSeconds ?? null,
    };
  }

  private buildQueues(snapshot: TenantSnapshot | null): SystemQueueSnapshot {
    if (!snapshot) {
      return {
        status: 'not_configured',
        import: EMPTY_QUEUE_COUNTS,
        export: EMPTY_QUEUE_COUNTS,
        cleanup: EMPTY_QUEUE_COUNTS,
        notification: EMPTY_QUEUE_COUNTS,
      };
    }

    return {
      status: snapshot.jobs.queues,
      import: snapshot.metrics.queues.import,
      export: snapshot.metrics.queues.export,
      cleanup: snapshot.metrics.queues.cleanup,
      notification: snapshot.metrics.queues.notification,
    };
  }

  private buildWorkers(snapshot: TenantSnapshot | null): WorkerHealthMap {
    if (!snapshot) {
      return UNKNOWN_WORKERS;
    }

    const source = snapshot.metrics.workers ?? snapshot.jobs.workers;
    return {
      import: source.import,
      export: source.export,
      cleanup: source.cleanup,
      notification: source.notification,
    };
  }

  private async getJobsSnapshot() {
    const stuckTimeoutMinutes =
      this.configService.get<number>('jobs.stuckTimeoutMinutes') ?? 15;
    const cutoff = new Date(Date.now() - stuckTimeoutMinutes * 60 * 1000);

    const [importGroups, exportGroups, stuckImports, stuckExports] =
      await Promise.all([
        this.prisma.importJob.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.exportJob.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.importJob.count({
          where: {
            status: JobStatus.PROCESSING,
            updatedAt: { lt: cutoff },
          },
        }),
        this.prisma.exportJob.count({
          where: {
            status: JobStatus.PROCESSING,
            updatedAt: { lt: cutoff },
          },
        }),
      ]);

    return {
      imports: toJobStatusCounts(importGroups),
      exports: toJobStatusCounts(exportGroups),
      stuckImports,
      stuckExports,
      stuckTimeoutMinutes,
    };
  }
}

function toJobStatusCounts(
  groups: Array<{ status: JobStatus; _count: { _all: number } }>,
): JobStatusCounts {
  const counts = { ...EMPTY_JOB_COUNTS };
  for (const row of groups) {
    counts[row.status] = row._count._all;
  }
  return counts;
}
