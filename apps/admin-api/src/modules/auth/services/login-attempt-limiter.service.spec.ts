import { ThrottlerException } from '@nestjs/throttler';
import { LoginAttemptLimiterService } from './login-attempt-limiter.service';

describe('LoginAttemptLimiterService', () => {
  let limiter: LoginAttemptLimiterService;

  beforeEach(() => {
    limiter = new LoginAttemptLimiterService();
  });

  it('allows attempts below the failure limit', () => {
    limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');
    limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');

    expect(() =>
      limiter.assertBelowLimit('1.2.3.4', 'admin@crmpro.local'),
    ).not.toThrow();
  });

  it('blocks after 5 failures for the same ip+email pair', () => {
    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');
    }

    expect(() =>
      limiter.assertBelowLimit('1.2.3.4', 'admin@crmpro.local'),
    ).toThrow(ThrottlerException);
  });

  it('scopes counters per ip and per email', () => {
    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');
    }

    expect(() =>
      limiter.assertBelowLimit('5.6.7.8', 'admin@crmpro.local'),
    ).not.toThrow();
    expect(() =>
      limiter.assertBelowLimit('1.2.3.4', 'other@crmpro.local'),
    ).not.toThrow();
  });

  it('clears the counter on successful login', () => {
    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');
    }

    limiter.reset('1.2.3.4', 'admin@crmpro.local');

    expect(() =>
      limiter.assertBelowLimit('1.2.3.4', 'admin@crmpro.local'),
    ).not.toThrow();
  });

  it('expires the failure window after 15 minutes', () => {
    jest.useFakeTimers();

    try {
      for (let i = 0; i < 5; i += 1) {
        limiter.recordFailure('1.2.3.4', 'admin@crmpro.local');
      }

      expect(() =>
        limiter.assertBelowLimit('1.2.3.4', 'admin@crmpro.local'),
      ).toThrow(ThrottlerException);

      jest.advanceTimersByTime(15 * 60 * 1000);

      expect(() =>
        limiter.assertBelowLimit('1.2.3.4', 'admin@crmpro.local'),
      ).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
