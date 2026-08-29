import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetAuditQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  actorAdminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date' })
  to?: string;
}
