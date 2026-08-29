import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { AnalyticsDateRange } from '../analytics.types';

export function parseAnalyticsDateRange(query: {
  from?: string;
  to?: string;
}): AnalyticsDateRange {
  const from = query.from ? parseDate(query.from, 'from') : undefined;
  const to = query.to ? parseEndDate(query.to, 'to') : undefined;

  if (from && to && from.getTime() > to.getTime()) {
    throw new BadRequestException(
      'Invalid date range: from must be before or equal to to',
    );
  }

  return { from, to };
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field} date`);
  }
  return parsed;
}

function parseEndDate(value: string, field: string): Date {
  const parsed = parseDate(value, field);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
}

@Injectable()
export class AnalyticsDateRangePipe implements PipeTransform {
  transform(value: { from?: string; to?: string }): AnalyticsDateRange {
    return parseAnalyticsDateRange(value);
  }
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = startOfUtcDay(date);
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function subtractUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  );
}

export function buildLeadCreatedAtFilter(
  range: AnalyticsDateRange,
): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) {
    return undefined;
  }

  return {
    ...(range.from && { gte: range.from }),
    ...(range.to && { lte: range.to }),
  };
}
