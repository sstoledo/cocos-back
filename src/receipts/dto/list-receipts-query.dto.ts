import { ReceiptDocumentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListReceiptsQueryDto {
  @IsOptional()
  @IsEnum(ReceiptDocumentStatus)
  status?: ReceiptDocumentStatus;
}
