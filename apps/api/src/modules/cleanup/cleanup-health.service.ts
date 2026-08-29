import { Injectable } from '@nestjs/common';
import { CLEANUP_JOB_NAMES, CleanupJobName } from './cleanup.constants';
import { CleanupHealthEntry, CleanupHealthStatus } from './cleanup.types';

@Injectable()
export class CleanupHealthService {
  private readonly entries = new Map<CleanupJobName, CleanupHealthEntry>();

  constructor() {
    for (const jobName of CLEANUP_JOB_NAMES) {
      this.entries.set(jobName, {
        lastRun: null,
        status: 'healthy',
      });
    }
  }

  recordSuccess(jobName: CleanupJobName): void {
    this.entries.set(jobName, {
      lastRun: new Date().toISOString(),
      status: 'healthy',
    });
  }

  recordFailure(jobName: CleanupJobName): void {
    const current = this.entries.get(jobName);
    this.entries.set(jobName, {
      lastRun: current?.lastRun ?? null,
      status: 'degraded',
    });
  }

  getHealthSummary(): {
    lastRun: string | null;
    status: 'healthy' | 'degraded';
  } {
    const entries = [...this.entries.values()];
    const lastRuns = entries
      .map((entry) => entry.lastRun)
      .filter((value): value is string => value !== null)
      .sort()
      .reverse();

    const status = entries.some((entry) => entry.status === 'degraded')
      ? 'degraded'
      : 'healthy';

    return {
      lastRun: lastRuns[0] ?? null,
      status,
    };
  }

  getDetailedHealth(): CleanupHealthStatus {
    return Object.fromEntries(this.entries.entries()) as CleanupHealthStatus;
  }
}
