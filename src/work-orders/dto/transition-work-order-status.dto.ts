import { WorkOrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionWorkOrderStatusDto {
  @IsEnum(WorkOrderStatus)
  status: WorkOrderStatus;
}
