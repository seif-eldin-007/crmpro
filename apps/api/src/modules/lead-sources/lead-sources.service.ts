import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { buildOrderBy, normalizeSearch, SortOrder } from '../../common/query';
import {
  normalizeDisplayName,
  normalizeNameForComparison,
} from '../../common/utils/name-normalization.util';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { ListLeadSourcesQueryDto } from './dto/list-lead-sources-query.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { LeadSourceResponse } from './types/lead-source.types';

const LEAD_SOURCE_SORT_FIELDS = ['name', 'createdAt'] as const;

const LEAD_SOURCE_SORT_CONFIG = {
  allowedFields: LEAD_SOURCE_SORT_FIELDS,
  defaultField: 'name' as const,
  defaultOrder: SortOrder.ASC,
};

@Injectable()
export class LeadSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async listLeadSources(
    tenantId: string,
    query: ListLeadSourcesQueryDto,
  ): Promise<PaginatedResponse<LeadSourceResponse>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildWhereClause(tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [sources, totalItems] = await this.prisma.$transaction([
      this.prisma.leadSource.findMany({
        where,
        orderBy,
        select: { id: true, name: true },
        skip,
        take,
      }),
      this.prisma.leadSource.count({ where }),
    ]);

    return buildPaginatedResponse(sources, page, limit, totalItems);
  }

  async getLeadSource(
    id: string,
    tenantId: string,
  ): Promise<LeadSourceResponse> {
    const source = await this.getLeadSourceOrThrow(id, tenantId);
    return this.toLeadSourceResponse(source);
  }

  async createLeadSource(
    tenantId: string,
    dto: CreateLeadSourceDto,
  ): Promise<LeadSourceResponse> {
    const name = this.normalizeName(dto.name);
    await this.ensureNameUnique(name, tenantId);

    try {
      const source = await this.prisma.leadSource.create({
        data: { tenantId, name },
        select: { id: true, name: true },
      });

      return source;
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateLeadSource(
    id: string,
    tenantId: string,
    dto: UpdateLeadSourceDto,
  ): Promise<LeadSourceResponse> {
    const source = await this.getLeadSourceOrThrow(id, tenantId);
    const name = this.normalizeName(dto.name);
    await this.ensureNameUnique(name, tenantId, source.id);

    try {
      const updated = await this.prisma.leadSource.update({
        where: { id: source.id },
        data: { name },
        select: { id: true, name: true },
      });

      return updated;
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async deleteLeadSource(
    id: string,
    tenantId: string,
  ): Promise<{ id: string }> {
    const source = await this.getLeadSourceOrThrow(id, tenantId);
    await this.ensureCanDelete(source.id);

    await this.prisma.leadSource.delete({
      where: { id: source.id },
    });

    return { id: source.id };
  }

  private buildWhereClause(
    tenantId: string,
    query: ListLeadSourcesQueryDto,
  ): Prisma.LeadSourceWhereInput {
    const search = normalizeSearch(query.search);

    return {
      tenantId,
      ...(search && {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      }),
    };
  }

  private buildOrderBy(
    query: ListLeadSourcesQueryDto,
  ): Prisma.LeadSourceOrderByWithRelationInput {
    return buildOrderBy(query.sortBy, query.sortOrder, LEAD_SOURCE_SORT_CONFIG);
  }

  private async getLeadSourceOrThrow(id: string, tenantId: string) {
    const source = await this.prisma.leadSource.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });

    if (!source) {
      throw new NotFoundException('Lead source not found');
    }

    return source;
  }

  private normalizeName(name: string): string {
    return normalizeDisplayName(name);
  }

  private async ensureNameUnique(
    name: string,
    tenantId: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = normalizeNameForComparison(name);

    const sources = await this.prisma.leadSource.findMany({
      where: {
        tenantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    const duplicate = sources.find(
      (source) => normalizeNameForComparison(source.name) === normalized,
    );

    if (duplicate) {
      throw new BadRequestException(
        'A lead source with this name already exists',
      );
    }
  }

  private async ensureCanDelete(id: string): Promise<void> {
    const leadCount = await this.prisma.lead.count({
      where: { sourceId: id },
    });

    if (leadCount > 0) {
      throw new BadRequestException(
        'Cannot delete lead source currently used by leads',
      );
    }
  }

  private toLeadSourceResponse(source: {
    id: string;
    name: string;
  }): LeadSourceResponse {
    return {
      id: source.id,
      name: source.name,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException(
        'A lead source with this name already exists',
      );
    }

    throw error;
  }
}
