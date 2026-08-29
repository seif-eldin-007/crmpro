import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import { SortOrder } from '../../../common/query';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LeadsService } from '../../leads/leads.service';
import { LeadExportParams } from '../../leads/types/lead.types';
import { LeadExportRow } from '../entities/export-job.types';
import { EXPORT_PROGRESS_BATCH_SIZE } from '../export-jobs.constants';

const leadExportSelect = {
  fullName: true,
  primaryPhone: true,
  secondaryPhone: true,
  email: true,
  status: true,
  createdAt: true,
  source: { select: { name: true } },
  pipeline: { select: { name: true } },
  pipelineStage: { select: { name: true } },
  assignedUser: { select: { name: true } },
  leadProjectInterests: {
    select: {
      project: { select: { name: true } },
    },
    orderBy: { project: { name: 'asc' } },
  },
} satisfies Prisma.LeadSelect;

type LeadExportRecord = Prisma.LeadGetPayload<{
  select: typeof leadExportSelect;
}>;

@Injectable()
export class LeadExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
  ) {}

  buildWhereInput(
    tenantId: string,
    params: LeadExportParams,
  ): Prisma.LeadWhereInput {
    return this.leadsService.buildLeadsWhereInput(tenantId, params);
  }

  buildOrderBy(params: LeadExportParams): Prisma.LeadOrderByWithRelationInput {
    return this.leadsService.buildLeadsOrderBy(
      params.sortBy,
      params.sortOrder as SortOrder | undefined,
    );
  }

  async countLeadsForExport(
    tenantId: string,
    params: LeadExportParams,
  ): Promise<number> {
    return this.prisma.lead.count({
      where: this.buildWhereInput(tenantId, params),
    });
  }

  async fetchAllForExport(
    tenantId: string,
    params: LeadExportParams,
    onProgress?: (processedRows: number, totalRows: number) => Promise<void>,
  ): Promise<LeadExportRow[]> {
    const where = this.buildWhereInput(tenantId, params);
    const orderBy = this.buildOrderBy(params);
    const totalRows = await this.prisma.lead.count({ where });
    const rows: LeadExportRow[] = [];
    let processedRows = 0;

    while (processedRows < totalRows) {
      const batch = await this.prisma.lead.findMany({
        where,
        select: leadExportSelect,
        orderBy,
        skip: processedRows,
        take: EXPORT_PROGRESS_BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      rows.push(...batch.map((lead) => this.toExportRow(lead)));
      processedRows += batch.length;

      if (onProgress) {
        await onProgress(processedRows, totalRows);
      }
    }

    return rows;
  }

  assertSupportedFormat(format: string): void {
    if (format !== 'CSV') {
      throw new BadRequestException(
        `Export format ${format} is not supported in Phase 1`,
      );
    }
  }

  private toExportRow(lead: LeadExportRecord): LeadExportRow {
    return {
      leadName: lead.fullName,
      primaryPhone: lead.primaryPhone,
      secondaryPhone: lead.secondaryPhone ?? '',
      email: lead.email ?? '',
      leadSource: lead.source?.name ?? '',
      pipeline: lead.pipeline.name,
      stage: lead.pipelineStage.name,
      assignedUser: lead.assignedUser?.name ?? '',
      interestedProjects: lead.leadProjectInterests
        .map((interest) => interest.project.name)
        .join(', '),
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
    };
  }
}
