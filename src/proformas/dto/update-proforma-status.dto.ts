import { ProformaStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateProformaStatusDto {
  @IsEnum(ProformaStatus)
  status: ProformaStatus;
}
