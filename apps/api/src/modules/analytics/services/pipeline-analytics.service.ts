import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PipelineAnalyticsData } from '../analytics.types';
import { nullableAverage } from '../mappers/analytics.mapper';

/**
 * Returns funnel metrics for the tenant default pipeline.
 * When no pipeline is marked default, the first pipeline by name is used.
 * Additional pipelines are ignored for this endpoint.
 */
@Injectable()
export class PipelineAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPipeline(tenantId: string): Promise<PipelineAnalyticsData> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        stages: {
          select: { id: true, name: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!pipeline) {
      return {
        pipelineId: '',
        pipelineName: '',
        stages: [],
      };
    }

    const [counts, avgDaysRows] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['pipelineStageId'],
        where: {
          tenantId,
          deletedAt: null,
          pipelineId: pipeline.id,
        },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        Array<{ stage_id: string; avg_days: number | null }>
      >`
        SELECT
          l."pipelineStageId" AS stage_id,
          AVG(
            EXTRACT(
              EPOCH FROM (
                NOW() - COALESCE(
                  (
                    SELECT MAX(la."createdAt")
                    FROM "LeadActivity" la
                    WHERE la."leadId" = l."id"
                      AND la."eventType" = 'STAGE_CHANGED'
                      AND la."metadata"->>'toStageId' = l."pipelineStageId"::text
                  ),
                  l."createdAt"
                )
              )
            ) / 86400.0
          )::float AS avg_days
        FROM "Lead" l
        WHERE l."tenantId" = ${tenantId}::uuid
          AND l."deletedAt" IS NULL
          AND l."pipelineId" = ${pipeline.id}::uuid
        GROUP BY l."pipelineStageId"
      `,
    ]);

    const countByStage = new Map(
      counts.map((row) => [row.pipelineStageId, row._count._all]),
    );
    const avgDaysByStage = new Map(
      avgDaysRows.map((row) => [row.stage_id, nullableAverage(row.avg_days)]),
    );

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stages: pipeline.stages.map((stage) => ({
        stageId: stage.id,
        name: stage.name,
        count: countByStage.get(stage.id) ?? 0,
        avgDaysInStage: avgDaysByStage.get(stage.id) ?? null,
      })),
    };
  }
}
