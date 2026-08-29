import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PipelineCloseType, Prisma } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { PipelineChangedEvent } from '../../common/events/domain-event.types';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { buildOrderBy, normalizeSearch, SortOrder } from '../../common/query';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { ListPipelinesQueryDto } from './dto/list-pipelines-query.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import {
  PipelineResponse,
  PipelineStageResponse,
} from './types/pipeline.types';

const PIPELINE_SORT_FIELDS = ['name', 'createdAt'] as const;

const PIPELINE_SORT_CONFIG = {
  allowedFields: PIPELINE_SORT_FIELDS,
  defaultField: 'createdAt' as const,
  defaultOrder: SortOrder.ASC,
};

type TransactionClient = Prisma.TransactionClient;

interface ClosedStageInput {
  isClosed: boolean;
  closeType: PipelineCloseType | null | undefined;
}

type StageRecord = {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
  isSystem: boolean;
  isClosed: boolean;
  closeType: PipelineCloseType | null;
  pipelineId: string;
  tenantId: string;
};

const STAGE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const DEFAULT_STAGE_DEFS = [
  { name: 'New Lead', color: '#94a3b8', isClosed: false, closeType: null },
  { name: 'Contacted', color: '#60a5fa', isClosed: false, closeType: null },
  { name: 'Qualified', color: '#818cf8', isClosed: false, closeType: null },
  { name: 'Interested', color: '#a78bfa', isClosed: false, closeType: null },
  { name: 'Negotiation', color: '#f59e0b', isClosed: false, closeType: null },
  {
    name: 'Won',
    color: '#22c55e',
    isClosed: true,
    closeType: PipelineCloseType.WON,
  },
  {
    name: 'Lost',
    color: '#ef4444',
    isClosed: true,
    closeType: PipelineCloseType.LOST,
  },
] as const;

const pipelineInclude = {
  stages: {
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.PipelineInclude;

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventBus: DomainEventBus,
  ) {}

  async listPipelines(
    tenantId: string,
    query: ListPipelinesQueryDto,
  ): Promise<PaginatedResponse<PipelineResponse>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildWhereClause(tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [pipelines, totalItems] = await this.prisma.$transaction([
      this.prisma.pipeline.findMany({
        where,
        include: pipelineInclude,
        orderBy,
        skip,
        take,
      }),
      this.prisma.pipeline.count({ where }),
    ]);

    const stageLeadCounts = await this.loadStageLeadCounts(
      tenantId,
      pipelines.map((pipeline) => pipeline.id),
    );

    return buildPaginatedResponse(
      pipelines.map((pipeline) =>
        this.toPipelineResponse(pipeline, stageLeadCounts),
      ),
      page,
      limit,
      totalItems,
    );
  }

  async getPipeline(id: string, tenantId: string): Promise<PipelineResponse> {
    const pipeline = await this.getPipelineOrThrow(id, tenantId);
    const stageLeadCounts = await this.loadStageLeadCounts(tenantId, [
      pipeline.id,
    ]);
    return this.toPipelineResponse(pipeline, stageLeadCounts);
  }

  async createPipeline(
    tenantId: string,
    dto: CreatePipelineDto,
  ): Promise<PipelineResponse> {
    const existingPipelineCount = await this.prisma.pipeline.count({
      where: { tenantId },
    });

    const shouldBeDefault =
      dto.isDefault === true || existingPipelineCount === 0;

    try {
      const pipeline = await this.prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await this.unsetExistingDefaultPipeline(tx, tenantId);
        }

        const created = await tx.pipeline.create({
          data: {
            tenantId,
            name: dto.name.trim(),
            isDefault: shouldBeDefault,
          },
        });

        await tx.pipelineStage.createMany({
          data: DEFAULT_STAGE_DEFS.map((stage, index) => ({
            tenantId,
            pipelineId: created.id,
            name: stage.name,
            color: stage.color,
            sortOrder: index + 1,
            isSystem: true,
            isClosed: stage.isClosed,
            closeType: stage.closeType,
          })),
        });

        return tx.pipeline.findUniqueOrThrow({
          where: { id: created.id },
          include: pipelineInclude,
        });
      });

      void this.domainEventBus.publish(
        new PipelineChangedEvent(tenantId, pipeline.id),
      );

      return this.toPipelineResponse(pipeline);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updatePipeline(
    id: string,
    tenantId: string,
    dto: UpdatePipelineDto,
  ): Promise<PipelineResponse> {
    const pipeline = await this.getPipelineOrThrow(id, tenantId);

    if (dto.isDefault === false && pipeline.isDefault) {
      throw new BadRequestException(
        'Cannot unset the default pipeline; set another pipeline as default first',
      );
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault === true && !pipeline.isDefault) {
          await this.unsetExistingDefaultPipeline(tx, tenantId);
        }

        return tx.pipeline.update({
          where: { id: pipeline.id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.isDefault !== undefined
              ? { isDefault: dto.isDefault }
              : {}),
          },
          include: pipelineInclude,
        });
      });

      void this.domainEventBus.publish(
        new PipelineChangedEvent(tenantId, pipeline.id),
      );

      return this.toPipelineResponse(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async deletePipeline(id: string, tenantId: string): Promise<{ id: string }> {
    const pipeline = await this.getPipelineOrThrow(id, tenantId);
    await this.ensurePipelineCanBeDeleted(pipeline);

    await this.prisma.pipeline.delete({
      where: { id: pipeline.id },
    });

    void this.domainEventBus.publish(new PipelineChangedEvent(tenantId, id));

    return { id: pipeline.id };
  }

  async createStage(
    pipelineId: string,
    tenantId: string,
    dto: CreateStageDto,
  ): Promise<PipelineStageResponse> {
    const pipeline = await this.getPipelineOrThrow(pipelineId, tenantId);

    const isClosed = dto.isClosed ?? false;
    const closeType = isClosed ? (dto.closeType ?? null) : null;

    this.validateClosedStageRules({ isClosed, closeType });

    const stageCount = pipeline.stages.length;
    this.validateSortOrderForInsert(dto.sortOrder, stageCount);

    try {
      const stage = await this.prisma.$transaction(async (tx) => {
        if (closeType) {
          await this.ensureUniqueClosedStageInTx(tx, pipeline.id, closeType);
        }

        await this.shiftStagesOnInsert(tx, pipeline.id, dto.sortOrder);

        return tx.pipelineStage.create({
          data: {
            tenantId: pipeline.tenantId,
            pipelineId: pipeline.id,
            name: dto.name.trim(),
            sortOrder: dto.sortOrder,
            color: dto.color ?? null,
            isClosed,
            closeType,
            isSystem: false,
          },
        });
      }, STAGE_TRANSACTION_OPTIONS);

      void this.domainEventBus.publish(
        new PipelineChangedEvent(tenantId, pipeline.id),
      );

      return this.toStageResponse(stage);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateStage(
    pipelineId: string,
    stageId: string,
    tenantId: string,
    dto: UpdateStageDto,
  ): Promise<PipelineStageResponse> {
    const stage = await this.getStageOrThrow(stageId, pipelineId, tenantId);

    this.validateSystemStageUpdate(stage, dto);

    const nextName = dto.name !== undefined ? dto.name.trim() : stage.name;
    const nextSortOrder =
      dto.sortOrder !== undefined ? dto.sortOrder : stage.sortOrder;
    const nextColor = dto.color !== undefined ? dto.color : stage.color;
    const nextIsClosed =
      dto.isClosed !== undefined ? dto.isClosed : stage.isClosed;
    let nextCloseType =
      dto.closeType !== undefined ? dto.closeType : stage.closeType;

    if (!nextIsClosed) {
      nextCloseType = null;
    }

    this.validateClosedStageRules({
      isClosed: nextIsClosed,
      closeType: nextCloseType,
    });

    if (dto.sortOrder !== undefined) {
      const stageCount = await this.prisma.pipelineStage.count({
        where: { pipelineId },
      });
      this.validateSortOrderForUpdate(nextSortOrder, stageCount);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (nextCloseType) {
          await this.ensureUniqueClosedStageInTx(
            tx,
            pipelineId,
            nextCloseType,
            stage.id,
          );
        }

        if (dto.sortOrder !== undefined && nextSortOrder !== stage.sortOrder) {
          await this.reorderStage(
            tx,
            pipelineId,
            stage.id,
            stage.sortOrder,
            nextSortOrder,
          );
        }

        return tx.pipelineStage.update({
          where: { id: stage.id },
          data: {
            name: nextName,
            sortOrder: nextSortOrder,
            color: nextColor,
            isClosed: nextIsClosed,
            closeType: nextCloseType,
          },
        });
      }, STAGE_TRANSACTION_OPTIONS);

      void this.domainEventBus.publish(
        new PipelineChangedEvent(tenantId, pipelineId),
      );

      return this.toStageResponse(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async deleteStage(
    pipelineId: string,
    stageId: string,
    tenantId: string,
  ): Promise<{ id: string }> {
    const stage = await this.getStageOrThrow(stageId, pipelineId, tenantId);

    if (stage.isSystem) {
      throw new BadRequestException('Cannot delete a system stage');
    }

    const stageCount = await this.prisma.pipelineStage.count({
      where: { pipelineId },
    });

    if (stageCount <= 1) {
      throw new BadRequestException(
        'Cannot delete the last stage of a pipeline',
      );
    }

    const leadsUsingStage = await this.prisma.lead.count({
      where: { pipelineStageId: stage.id },
    });

    if (leadsUsingStage > 0) {
      throw new BadRequestException(
        'Cannot delete a stage that is in use by leads',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pipelineStage.delete({
        where: { id: stage.id },
      });

      await this.compactStagesAfterDelete(tx, pipelineId, stage.sortOrder);
    }, STAGE_TRANSACTION_OPTIONS);

    void this.domainEventBus.publish(
      new PipelineChangedEvent(tenantId, pipelineId),
    );

    return { id: stage.id };
  }

  private buildWhereClause(
    tenantId: string,
    query: ListPipelinesQueryDto,
  ): Prisma.PipelineWhereInput {
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
    query: ListPipelinesQueryDto,
  ): Prisma.PipelineOrderByWithRelationInput {
    return buildOrderBy(query.sortBy, query.sortOrder, PIPELINE_SORT_CONFIG);
  }

  private async getPipelineOrThrow(id: string, tenantId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, tenantId },
      include: pipelineInclude,
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    return pipeline;
  }

  private async getStageOrThrow(
    stageId: string,
    pipelineId: string,
    tenantId: string,
  ): Promise<StageRecord> {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: stageId,
        pipelineId,
        tenantId,
      },
    });

    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }

    return stage;
  }

  private isTerminalSystemStage(stage: {
    isSystem: boolean;
    closeType: PipelineCloseType | null;
  }): boolean {
    return (
      stage.isSystem &&
      (stage.closeType === PipelineCloseType.WON ||
        stage.closeType === PipelineCloseType.LOST)
    );
  }

  private validateSystemStageUpdate(
    stage: StageRecord,
    dto: UpdateStageDto,
  ): void {
    if (!stage.isSystem) {
      return;
    }

    if (dto.isClosed !== undefined || dto.closeType !== undefined) {
      throw new BadRequestException(
        'Cannot modify closed semantics of a system stage',
      );
    }

    if (this.isTerminalSystemStage(stage) && dto.sortOrder !== undefined) {
      throw new BadRequestException(
        'Cannot reorder terminal system stages (Won/Lost)',
      );
    }
  }

  private validateSortOrderForInsert(
    sortOrder: number,
    stageCount: number,
  ): void {
    if (sortOrder < 1 || sortOrder > stageCount + 1) {
      throw new BadRequestException(
        `sortOrder must be between 1 and ${stageCount + 1}`,
      );
    }
  }

  private validateSortOrderForUpdate(
    sortOrder: number,
    stageCount: number,
  ): void {
    if (sortOrder < 1 || sortOrder > stageCount) {
      throw new BadRequestException(
        `sortOrder must be between 1 and ${stageCount}`,
      );
    }
  }

  private validateClosedStageRules(input: ClosedStageInput): void {
    const closeType = input.closeType ?? null;

    if (!input.isClosed && closeType !== null) {
      throw new BadRequestException(
        'closeType must be null when isClosed is false',
      );
    }

    if (input.isClosed && closeType === null) {
      throw new BadRequestException(
        'closeType is required when isClosed is true',
      );
    }
  }

  private async ensureUniqueClosedStageInTx(
    tx: TransactionClient,
    pipelineId: string,
    closeType: PipelineCloseType,
    excludeStageId?: string,
  ): Promise<void> {
    const existing = await tx.pipelineStage.findFirst({
      where: {
        pipelineId,
        closeType,
        ...(excludeStageId ? { id: { not: excludeStageId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Pipeline already has a ${closeType} stage`,
      );
    }
  }

  private async shiftStagesOnInsert(
    tx: TransactionClient,
    pipelineId: string,
    sortOrder: number,
  ): Promise<void> {
    const stagesToShift = await tx.pipelineStage.findMany({
      where: { pipelineId, sortOrder: { gte: sortOrder } },
      orderBy: { sortOrder: 'desc' },
      select: { id: true, sortOrder: true },
    });

    for (const stage of stagesToShift) {
      await tx.pipelineStage.update({
        where: { id: stage.id },
        data: { sortOrder: stage.sortOrder + 1 },
      });
    }
  }

  private async reorderStage(
    tx: TransactionClient,
    pipelineId: string,
    stageId: string,
    fromOrder: number,
    toOrder: number,
  ): Promise<void> {
    if (fromOrder === toOrder) {
      return;
    }

    const stageCount = await tx.pipelineStage.count({
      where: { pipelineId },
    });

    // Park the moved stage outside the active range so intermediate updates
    // never violate @@unique([pipelineId, sortOrder]).
    await tx.pipelineStage.update({
      where: { id: stageId },
      data: { sortOrder: stageCount + 1000 },
    });

    if (toOrder < fromOrder) {
      const stagesToShift = await tx.pipelineStage.findMany({
        where: {
          pipelineId,
          sortOrder: { gte: toOrder, lt: fromOrder },
        },
        orderBy: { sortOrder: 'desc' },
        select: { id: true, sortOrder: true },
      });

      for (const stage of stagesToShift) {
        await tx.pipelineStage.update({
          where: { id: stage.id },
          data: { sortOrder: stage.sortOrder + 1 },
        });
      }

      return;
    }

    const stagesToShift = await tx.pipelineStage.findMany({
      where: {
        pipelineId,
        sortOrder: { gt: fromOrder, lte: toOrder },
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, sortOrder: true },
    });

    for (const stage of stagesToShift) {
      await tx.pipelineStage.update({
        where: { id: stage.id },
        data: { sortOrder: stage.sortOrder - 1 },
      });
    }
  }

  private async compactStagesAfterDelete(
    tx: TransactionClient,
    pipelineId: string,
    deletedSortOrder: number,
  ): Promise<void> {
    const stagesToShift = await tx.pipelineStage.findMany({
      where: { pipelineId, sortOrder: { gt: deletedSortOrder } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, sortOrder: true },
    });

    for (const stage of stagesToShift) {
      await tx.pipelineStage.update({
        where: { id: stage.id },
        data: { sortOrder: stage.sortOrder - 1 },
      });
    }
  }

  private async ensurePipelineCanBeDeleted(pipeline: {
    id: string;
    isDefault: boolean;
  }): Promise<void> {
    if (pipeline.isDefault) {
      throw new BadRequestException('Cannot delete the default pipeline');
    }

    const leadCount = await this.prisma.lead.count({
      where: { pipelineId: pipeline.id },
    });

    if (leadCount > 0) {
      throw new BadRequestException('Cannot delete a pipeline that has leads');
    }
  }

  private async unsetExistingDefaultPipeline(
    tx: TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await tx.pipeline.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async loadStageLeadCounts(
    tenantId: string,
    pipelineIds: string[],
  ): Promise<Map<string, number>> {
    if (pipelineIds.length === 0) {
      return new Map();
    }

    const counts = await this.prisma.lead.groupBy({
      by: ['pipelineStageId'],
      where: {
        tenantId,
        pipelineId: { in: pipelineIds },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    return new Map(counts.map((row) => [row.pipelineStageId, row._count._all]));
  }

  private toPipelineResponse(
    pipeline: Prisma.PipelineGetPayload<{ include: typeof pipelineInclude }>,
    stageLeadCounts: Map<string, number> = new Map(),
  ): PipelineResponse {
    return {
      id: pipeline.id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      createdAt: pipeline.createdAt,
      updatedAt: pipeline.updatedAt,
      stages: pipeline.stages.map((stage) =>
        this.toStageResponse(stage, stageLeadCounts.get(stage.id) ?? 0),
      ),
    };
  }

  private toStageResponse(
    stage: {
      id: string;
      name: string;
      sortOrder: number;
      color: string | null;
      isSystem: boolean;
      isClosed: boolean;
      closeType: PipelineCloseType | null;
    },
    leadCount = 0,
  ): PipelineStageResponse {
    return {
      id: stage.id,
      name: stage.name,
      sortOrder: stage.sortOrder,
      color: stage.color,
      isSystem: stage.isSystem,
      isClosed: stage.isClosed,
      closeType: stage.closeType,
      leadCount,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException('A unique constraint was violated');
    }

    throw error;
  }
}
