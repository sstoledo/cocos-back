import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LotsModule } from '../lots/lots.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { UploadModule } from '../upload/upload.module';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UploadModule,
    LotsModule,
    PurchaseOrdersModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptOcrService],
  exports: [ReceiptsService, ReceiptOcrService],
})
export class ReceiptsModule {}
