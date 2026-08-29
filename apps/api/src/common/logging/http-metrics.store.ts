import { Injectable } from '@nestjs/common';

const MAX_DURATION_SAMPLES = 10_000;

@Injectable()
export class HttpMetricsStore {
  private totalRequests = 0;
  private totalErrors = 0;
  private totalDurationMs = 0;
  private readonly durations: number[] = [];

  recordRequest(durationMs: number, statusCode: number): void {
    this.totalRequests += 1;
    this.totalDurationMs += durationMs;

    if (statusCode >= 400) {
      this.totalErrors += 1;
    }

    this.durations.push(durationMs);
    if (this.durations.length > MAX_DURATION_SAMPLES) {
      this.durations.shift();
    }
  }

  getSnapshot() {
    const averageResponseTimeMs =
      this.totalRequests === 0
        ? 0
        : Math.round(this.totalDurationMs / this.totalRequests);

    return {
      totalRequests: this.totalRequests,
      averageResponseTimeMs,
      p95ResponseTimeMs: this.calculateP95(),
      errorRate:
        this.totalRequests === 0
          ? 0
          : Number(((this.totalErrors / this.totalRequests) * 100).toFixed(1)),
    };
  }

  private calculateP95(): number {
    if (this.durations.length === 0) {
      return 0;
    }

    const sorted = [...this.durations].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }
}
