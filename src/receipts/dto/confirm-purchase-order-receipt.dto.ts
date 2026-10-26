import { IsNotEmpty, IsString } from 'class-validator';
import { ReceivePurchaseOrderDto } from '../../purchase-orders/dto/receive-purchase-order.dto';

export class ConfirmPurchaseOrderReceiptDto extends ReceivePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderId: string;
}
