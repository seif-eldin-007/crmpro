import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeWhitespace } from '../../../common/utils/name-normalization.util';

export class CreateProjectDto {
  @IsUUID()
  developerId: string;

  @Transform(({ value }: { value: unknown }) => normalizeWhitespace(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(255)
  location?: string;
}
