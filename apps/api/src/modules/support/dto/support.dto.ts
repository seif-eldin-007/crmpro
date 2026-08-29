import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';
import { IsEnum } from 'class-validator';
import { SupportConversationStatus } from '@crmpro/database';

export class GetSupportConversationsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(SupportConversationStatus)
  status?: SupportConversationStatus;
}

export class CreateSupportConversationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class CreateSupportMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}
