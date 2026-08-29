import { LeadStatus } from '@crmpro/database';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { normalizeSearchInput } from '../../../common/query/utils/search.util';

export class LeadExportFiltersDto {
  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @Transform(({ value }) => normalizeSearchInput(value))
  @IsString()
  @MaxLength(200)
  search?: string;
}
