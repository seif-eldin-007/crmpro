import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetAdminsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
