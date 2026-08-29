import { FileAssetCategory } from '@crmpro/database';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PHASE1_UPLOAD_CATEGORIES } from '../files.constants';

const Phase1Category = {
  LEAD_ATTACHMENT: FileAssetCategory.LEAD_ATTACHMENT,
  IMPORT_FILE: FileAssetCategory.IMPORT_FILE,
  OTHER: FileAssetCategory.OTHER,
} as const;

type Phase1CategoryValue = (typeof Phase1Category)[keyof typeof Phase1Category];

export class CompleteUploadDto {
  @IsString()
  @MaxLength(500)
  objectKey: string;

  @IsEnum(Phase1Category, {
    message: `category must be one of: ${PHASE1_UPLOAD_CATEGORIES.join(', ')}`,
  })
  category: Phase1CategoryValue;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}
