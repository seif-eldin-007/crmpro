import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../files.constants';

export class RequestUploadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_FILE_SIZE_BYTES)
  sizeBytes: number;
}
