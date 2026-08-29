import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportConversationStatus } from '@crmpro/database';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetAdminSupportConversationsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(SupportConversationStatus)
  status?: SupportConversationStatus;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class CreateAdminSupportMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class UpdateAdminSupportStatusDto {
  @IsEnum(SupportConversationStatus)
  status!: SupportConversationStatus;
}
