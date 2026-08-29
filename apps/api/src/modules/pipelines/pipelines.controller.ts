import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PermissionsGuard, RequirePermission } from '../../common/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { ListPipelinesQueryDto } from './dto/list-pipelines-query.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { PipelinesService } from './pipelines.service';

@Controller('pipelines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PIPELINE_READ)
  async listPipelines(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPipelinesQueryDto,
  ) {
    const data = await this.pipelinesService.listPipelines(
      user.tenantId,
      query,
    );

    return { success: true, data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PIPELINE_READ)
  async getPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.pipelinesService.getPipeline(id, user.tenantId);

    return { success: true, data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.PIPELINE_CREATE)
  async createPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePipelineDto,
  ) {
    const data = await this.pipelinesService.createPipeline(user.tenantId, dto);

    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PIPELINE_UPDATE)
  async updatePipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    const data = await this.pipelinesService.updatePipeline(
      id,
      user.tenantId,
      dto,
    );

    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PIPELINE_DELETE)
  async deletePipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.pipelinesService.deletePipeline(id, user.tenantId);

    return { success: true, data };
  }

  @Post(':pipelineId/stages')
  @RequirePermission(PERMISSIONS.PIPELINE_UPDATE)
  async createStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pipelineId', ParseUUIDPipe) pipelineId: string,
    @Body() dto: CreateStageDto,
  ) {
    const data = await this.pipelinesService.createStage(
      pipelineId,
      user.tenantId,
      dto,
    );

    return { success: true, data };
  }

  @Patch(':pipelineId/stages/:stageId')
  @RequirePermission(PERMISSIONS.PIPELINE_UPDATE)
  async updateStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pipelineId', ParseUUIDPipe) pipelineId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    const data = await this.pipelinesService.updateStage(
      pipelineId,
      stageId,
      user.tenantId,
      dto,
    );

    return { success: true, data };
  }

  @Delete(':pipelineId/stages/:stageId')
  @RequirePermission(PERMISSIONS.PIPELINE_UPDATE)
  async deleteStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pipelineId', ParseUUIDPipe) pipelineId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    const data = await this.pipelinesService.deleteStage(
      pipelineId,
      stageId,
      user.tenantId,
    );

    return { success: true, data };
  }
}
