import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import {
  BULK_ACTION_VALIDATION_MESSAGE,
  MAX_BULK_ACTION_SIZE,
} from '../constants/leads-bulk.constants';

export class BulkMoveStageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_ACTION_SIZE, {
    message: BULK_ACTION_VALIDATION_MESSAGE,
  })
  @IsUUID('4', { each: true })
  leadIds: string[];

  @IsUUID('4')
  targetStageId: string;
}
