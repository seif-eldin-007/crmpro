import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizeWhitespace } from '../../../common/utils/name-normalization.util';

export class UpdateProjectDto {
  @IsOptional()
  @IsUUID()
  developerId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeWhitespace(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return value;
  })
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
