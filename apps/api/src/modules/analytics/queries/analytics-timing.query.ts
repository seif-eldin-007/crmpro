import { Prisma } from '@crmpro/database';
import { AnalyticsDateRange } from '../analytics.types';

const RESPONSE_EVENTS_IN_SQL = Prisma.sql`
  'ASSIGNED', 'REASSIGNED', 'STAGE_CHANGED',
  'NOTE_ADDED', 'CALL_LOGGED', 'EMAIL_LOGGED', 'WHATSAPP_LOGGED'
`;

export function buildLeadCreatedAtSql(
  range: AnalyticsDateRange,
  column = 'l."createdAt"',
): Prisma.Sql {
  if (range.from && range.to) {
    return Prisma.sql`${Prisma.raw(column)} >= ${range.from} AND ${Prisma.raw(column)} <= ${range.to}`;
  }

  if (range.from) {
    return Prisma.sql`${Prisma.raw(column)} >= ${range.from}`;
  }

  if (range.to) {
    return Prisma.sql`${Prisma.raw(column)} <= ${range.to}`;
  }

  return Prisma.sql`TRUE`;
}

export async function queryAvgResponseTimeHours(
  prisma: {
    $queryRaw: <T>(
      query: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ) => Promise<T>;
  },
  tenantId: string,
  range: AnalyticsDateRange,
): Promise<number | null> {
  const dateFilter = buildLeadCreatedAtSql(range);

  const rows = await prisma.$queryRaw<Array<{ avg_hours: number | null }>>`
    SELECT AVG(
      EXTRACT(EPOCH FROM (first_response.first_at - l."createdAt")) / 3600.0
    ) AS avg_hours
    FROM "Lead" l
    INNER JOIN LATERAL (
      SELECT MIN(la."createdAt") AS first_at
      FROM "LeadActivity" la
      WHERE la."leadId" = l."id"
        AND la."eventType"::text IN (${RESPONSE_EVENTS_IN_SQL})
    ) first_response ON first_response.first_at IS NOT NULL
    WHERE l."tenantId" = ${tenantId}::uuid
      AND l."deletedAt" IS NULL
      AND ${dateFilter}
  `;

  return rows[0]?.avg_hours ?? null;
}

export async function queryAvgLeadAgeDays(
  prisma: {
    $queryRaw: <T>(
      query: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ) => Promise<T>;
  },
  tenantId: string,
  range: AnalyticsDateRange,
): Promise<number | null> {
  const dateFilter = buildLeadCreatedAtSql(range);

  const rows = await prisma.$queryRaw<Array<{ avg_days: number | null }>>`
    SELECT AVG(
      EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400.0
    ) AS avg_days
    FROM "Lead" l
    INNER JOIN "PipelineStage" ps ON ps."id" = l."pipelineStageId"
    WHERE l."tenantId" = ${tenantId}::uuid
      AND l."deletedAt" IS NULL
      AND l."status" = 'OPEN'
      AND ps."isClosed" = false
      AND ${dateFilter}
  `;

  return rows[0]?.avg_days ?? null;
}

export interface AgentTimingRow {
  user_id: string;
  avg_response_hours: number | null;
  avg_closing_days: number | null;
}

export async function queryAgentTimingMetrics(
  prisma: {
    $queryRaw: <T>(
      query: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ) => Promise<T>;
  },
  tenantId: string,
  range: AnalyticsDateRange,
): Promise<AgentTimingRow[]> {
  const dateFilter = buildLeadCreatedAtSql(range);

  return prisma.$queryRaw<AgentTimingRow[]>`
    SELECT
      l."assignedUserId" AS user_id,
      AVG(
        EXTRACT(EPOCH FROM (first_touch.first_at - l."createdAt")) / 3600.0
      ) AS avg_response_hours,
      AVG(
        CASE
          WHEN won_event.won_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (won_event.won_at - l."createdAt")) / 86400.0
        END
      ) AS avg_closing_days
    FROM "Lead" l
    LEFT JOIN LATERAL (
      SELECT MIN(la."createdAt") AS first_at
      FROM "LeadActivity" la
      WHERE la."leadId" = l."id"
        AND la."actorUserId" = l."assignedUserId"
        AND la."eventType"::text IN (${RESPONSE_EVENTS_IN_SQL})
    ) first_touch ON true
    LEFT JOIN LATERAL (
      SELECT MIN(la."createdAt") AS won_at
      FROM "LeadActivity" la
      WHERE la."leadId" = l."id"
        AND la."eventType" = 'STAGE_CHANGED'
        AND la.metadata->>'closeType' = 'WON'
    ) won_event ON true
    WHERE l."tenantId" = ${tenantId}::uuid
      AND l."deletedAt" IS NULL
      AND l."assignedUserId" IS NOT NULL
      AND ${dateFilter}
    GROUP BY l."assignedUserId"
  `;
}
