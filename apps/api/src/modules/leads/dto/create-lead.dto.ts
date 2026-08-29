import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { normalizeWhitespace } from '../../../common/utils/name-normalization.util';
import { ProjectInterestDto } from './project-interest.dto';

export class CreateLeadDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsUUID()
  pipelineId: string;

  @IsUUID()
  pipelineStageId: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @Transform(({ value }: { value: unknown }) => normalizeWhitespace(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  primaryPhone: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) {
      return value;
    }
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @MinLength(1)
  secondaryPhone?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : null;
    }
    return value;
  })
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectInterestDto)
  projectInterests?: ProjectInterestDto[];
}
