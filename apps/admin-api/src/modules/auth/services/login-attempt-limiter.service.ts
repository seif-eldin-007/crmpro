import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface FailureRecord {
  count: number;
  windowStartedAt: number;
}

/**
 * Failure-based brute-force limiter for platform admin logins.
 *
 * Complements the global throttler (which counts every request regardless of
 * outcome): after 5 failed attempts for the same ip+email pair within 15
 * minutes, further attempts are rejected until the window expires. A
 * successful login clears the counter for that pair. In-memory on purpose —
 * the admin API runs as a single instance.
 */
@Injectable()
export class LoginAttemptLimiterService {
  private readonly logger = new Logger(LoginAttemptLimiterService.name);
  private readonly failures = new Map<string, FailureRecord>();

  assertBelowLimit(ip: string, email: string): void {
    const key = this.buildKey(ip, email);
    const record = this.failures.get(key);
    if (!record) {
      return;
    }

    if (Date.now() - record.windowStartedAt >= WINDOW_MS) {
      this.failures.delete(key);
      return;
    }

    if (record.count >= MAX_FAILURES) {
      this.logger.warn(
        `Login blocked: ${MAX_FAILURES} failed attempts for ${email} from ${ip}`,
      );
      throw new ThrottlerException();
    }
  }

  recordFailure(ip: string, email: string): void {
    const key = this.buildKey(ip, email);
    const now = Date.now();
    const record = this.failures.get(key);

    if (!record || now - record.windowStartedAt >= WINDOW_MS) {
      this.failures.set(key, { count: 1, windowStartedAt: now });
      return;
    }

    record.count += 1;
  }

  reset(ip: string, email: string): void {
    this.failures.delete(this.buildKey(ip, email));
  }

  private buildKey(ip: string, email: string): string {
    return `${ip}:${email.toLowerCase()}`;
  }
}
