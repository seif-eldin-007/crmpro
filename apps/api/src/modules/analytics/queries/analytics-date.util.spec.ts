import { BadRequestException } from '@nestjs/common';
import {
  buildLeadCreatedAtFilter,
  parseAnalyticsDateRange,
  startOfUtcDay,
  startOfUtcMonth,
  subtractUtcMonths,
} from './analytics-date.util';

describe('analytics-date.util', () => {
  describe('parseAnalyticsDateRange', () => {
    it('returns empty range when dates are omitted', () => {
      expect(parseAnalyticsDateRange({})).toEqual({
        from: undefined,
        to: undefined,
      });
    });

    it('parses ISO dates', () => {
      const range = parseAnalyticsDateRange({
        from: '2026-01-01',
        to: '2026-06-30',
      });

      expect(range.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(range.to?.toISOString()).toBe('2026-06-30T23:59:59.999Z');
    });

    it('rejects invalid dates', () => {
      expect(() => parseAnalyticsDateRange({ from: 'not-a-date' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects impossible ranges', () => {
      expect(() =>
        parseAnalyticsDateRange({
          from: '2026-06-30',
          to: '2026-01-01',
        }),
      ).toThrow('Invalid date range');
    });
  });

  describe('buildLeadCreatedAtFilter', () => {
    it('returns undefined when no bounds are provided', () => {
      expect(buildLeadCreatedAtFilter({})).toBeUndefined();
    });

    it('builds gte/lte filters from the range', () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-06-30T23:59:59.999Z');

      expect(buildLeadCreatedAtFilter({ from, to })).toEqual({
        gte: from,
        lte: to,
      });
    });
  });

  describe('UTC helpers', () => {
    it('computes month boundaries in UTC', () => {
      const date = new Date('2026-06-15T12:00:00.000Z');
      expect(startOfUtcDay(date).toISOString()).toBe(
        '2026-06-15T00:00:00.000Z',
      );
      expect(startOfUtcMonth(date).toISOString()).toBe(
        '2026-06-01T00:00:00.000Z',
      );
      expect(subtractUtcMonths(startOfUtcMonth(date), 11).toISOString()).toBe(
        '2025-07-01T00:00:00.000Z',
      );
    });
  });
});
