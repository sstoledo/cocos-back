import type { ReceiptDocumentStatus } from '@prisma/client';
import type { ReceiptExtraction } from '../receipt-ocr.service';

export class ReceiptResponseDto {
  id: string;
  status: ReceiptDocumentStatus;
  mimeType: string;
  fileName: string;
  filePublicId: string;
  fileUrl: string;
  extracted: ReceiptExtraction | null;
  ocrModel: string | null;
  ocrPayload: unknown;
  lotId: string | null;
  lot: { id: string; lotNumber: string } | null;
  purchaseOrderId: string | null;
  purchaseOrder: {
    id: string;
    purchaseOrderNumber: string;
  } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
