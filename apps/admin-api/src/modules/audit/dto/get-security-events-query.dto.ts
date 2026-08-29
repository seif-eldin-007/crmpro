import { AdminSecurityEventType, SecuritySeverity } from '@crmpro/database';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetSecurityEventsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @IsOptional()
  @IsEnum(AdminSecurityEventType)
  eventType?: AdminSecurityEventType;

  @IsOptional()
  @IsEnum(SecuritySeverity)
  severity?: SecuritySeverity;

  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date' })
  to?: string;
}
