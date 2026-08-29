import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../../common/query/dto/list-query.dto';

export class GetUsersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
