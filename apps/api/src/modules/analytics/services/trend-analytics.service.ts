import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  AnalyticsDateRange,
  TrendAnalyticsData,
  TrendCountPoint,
} from '../analytics.types';

@Injectable()
export class TrendAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrends(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<TrendAnalyticsData> {
    const from = range.from!;
    const to = range.to!;

    const [creationRows, closingRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT
          to_char(date_trunc('day', l."createdAt"), 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Lead" l
        WHERE l."tenantId" = ${tenantId}::uuid
          AND l."deletedAt" IS NULL
          AND l."createdAt" >= ${from}
          AND l."createdAt" <= ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT
          to_char(date_trunc('day', la."createdAt"), 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "LeadActivity" la
        WHERE la."tenantId" = ${tenantId}::uuid
          AND la."eventType" = 'STAGE_CHANGED'
          AND la."metadata"->>'closeType' = 'WON'
          AND la."createdAt" >= ${from}
          AND la."createdAt" <= ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const dateKeys = this.buildDateKeys(from, to);

    return {
      leadCreation: this.fillDailySeries(
        dateKeys,
        creationRows.map((row) => ({
          date: row.date,
          count: Number(row.count),
        })),
      ),
      leadClosing: this.fillDailySeries(
        dateKeys,
        closingRows.map((row) => ({
          date: row.date,
          count: Number(row.count),
        })),
      ),
    };
  }

  private buildDateKeys(from: Date, to: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);

    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);

    while (cursor <= end) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return keys;
  }

  private fillDailySeries(
    dateKeys: string[],
    points: TrendCountPoint[],
  ): TrendCountPoint[] {
    const countByDate = new Map(
      points.map((point) => [point.date, point.count]),
    );

    return dateKeys.map((date) => ({
      date,
      count: countByDate.get(date) ?? 0,
    }));
  }
}
