import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationPriority, NotificationType } from '@crmpro/database';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetNotificationsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date' })
  to?: string;
}
