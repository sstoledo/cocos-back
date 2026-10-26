import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { ConfirmLotDto } from './dto/confirm-lot-subscription.dto';
import { ConfirmPurchaseOrderReceiptDto } from './dto/confirm-purchase-order-receipt.dto';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';
import { RECEIPT_FILE_MAX_SIZE, ReceiptsService } from './receipts.service';

export const RECEIPT_FILE_REQUIRED_PIPE = new ParseFilePipe();

export const RECEIPT_FILE_SIZE_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({
      maxSize: RECEIPT_FILE_MAX_SIZE,
      message: 'Receipt file must not exceed 10 MB',
    }),
  ],
  errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
});

export const RECEIPT_FILE_TYPE_PIPE = new ParseFilePipe({
  validators: [
    new FileTypeValidator({
      fileType: 'application/pdf|image/(jpeg|png|webp)',
      skipMagicNumbersValidation: true,
    }),
  ],
  errorHttpStatusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
});

const READ_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Mechanic,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
];
const WRITE_ROLES = [RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse];

@Controller('receipts')
@UseGuards(RolesGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListReceiptsQueryDto) {
    return this.receiptsService.findAll(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UploadedFile(
      RECEIPT_FILE_REQUIRED_PIPE,
      RECEIPT_FILE_SIZE_PIPE,
      RECEIPT_FILE_TYPE_PIPE
    )
    file: Express.Multer.File
  ) {
    return this.receiptsService.createReceipt(file);
  }

  @Post(':id/confirm-lot')
  @Roles(...WRITE_ROLES)
  confirmLot(@Param('id') id: string, @Body() dto: ConfirmLotDto) {
    return this.receiptsService.confirmLot(id, dto);
  }

  @Post(':id/confirm-purchase-order')
  @Roles(...WRITE_ROLES)
  confirmPurchaseOrder(
    @Param('id') id: string,
    @Body() dto: ConfirmPurchaseOrderReceiptDto
  ) {
    return this.receiptsService.confirmPurchaseOrder(id, dto);
  }

  @Post(':id/ocr')
  @Roles(...WRITE_ROLES)
  retryOcr(@Param('id') id: string) {
    return this.receiptsService.retryOcr(id);
  }

  @Post(':id/discard')
  @Roles(...WRITE_ROLES)
  discard(@Param('id') id: string) {
    return this.receiptsService.discard(id);
  }
}
