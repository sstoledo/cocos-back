import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  Prisma,
  type ReceiptDocument,
  ReceiptDocumentStatus,
} from '@prisma/client';
import type { CreateLotDto } from '../lots/dto/create-lot.dto';
import { LotsService } from '../lots/lots.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { UploadService } from '../upload/upload.service';
import type { ConfirmLotDto } from './dto/confirm-lot-subscription.dto';
import type { ConfirmPurchaseOrderReceiptDto } from './dto/confirm-purchase-order-receipt.dto';
import type { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';
import type { ReceiptResponseDto } from './dto/receipt-response.dto';
import {
  type ReceiptExtraction,
  type ReceiptOcrResult,
  ReceiptOcrService,
} from './receipt-ocr.service';

export const RECEIPT_FILE_MAX_SIZE = 10 * 1024 * 1024;
export const RECEIPT_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const receiptInclude = {
  supplier: { select: { id: true, name: true } },
  lot: { select: { id: true, lotNumber: true } },
  purchaseOrder: {
    select: { id: true, purchaseOrderNumber: true },
  },
};

type ReceiptRecord = ReceiptDocument & {
  supplier: { id: string; name: string } | null;
  lot: { id: string; lotNumber: string } | null;
  purchaseOrder: {
    id: string;
    purchaseOrderNumber: string;
  } | null;
};

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly ocrService: ReceiptOcrService,
    private readonly lotsService: LotsService,
    private readonly purchaseOrdersService: PurchaseOrdersService
  ) {}

  async createReceipt(file: Express.Multer.File) {
    this.validateFile(file);
    const uploaded = await this.uploadService.uploadImage(
      file.buffer,
      'receipts'
    );
    const created = await this.prisma.receiptDocument.create({
      data: {
        status: ReceiptDocumentStatus.pending,
        mimeType: file.mimetype,
        fileName: file.originalname,
        filePublicId: uploaded.publicId,
        fileUrl: uploaded.url,
      },
      include: receiptInclude,
    });

    if (!this.ocrService.isConfigured()) {
      return this.toResponse(created);
    }

    try {
      const result = await this.ocrService.extractDetailed(
        file.buffer,
        file.mimetype
      );
      const updated = await this.saveOcrResult(created.id, result);
      return this.toResponse(updated);
    } catch {
      this.logger.warn(`OCR failed for uploaded receipt ${created.id}`);
      return this.toResponse(created);
    }
  }

  async findAll(query: ListReceiptsQueryDto = {}) {
    const receipts = await this.prisma.receiptDocument.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: receiptInclude,
    });
    return receipts.map((receipt) => this.toResponse(receipt));
  }

  async findOne(id: string): Promise<ReceiptResponseDto> {
    return this.toResponse(await this.getReceipt(id));
  }

  async retryOcr(id: string): Promise<ReceiptResponseDto> {
    const receipt = await this.getReceipt(id);
    this.ensurePending(receipt);
    this.ensureOcrConfigured();

    let buffer: Buffer;
    try {
      const response = await fetch(receipt.fileUrl);
      if (!response.ok) {
        throw new Error(`Stored file returned ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new BadGatewayException(
        {
          message: 'Stored receipt file could not be fetched',
          errorCode: 'RECEIPT_FILE_FETCH_FAILED',
        },
        { cause: error }
      );
    }

    try {
      const result = await this.ocrService.extractDetailed(
        buffer,
        receipt.mimeType
      );
      return this.toResponse(await this.saveOcrResult(id, result));
    } catch (error) {
      this.logger.warn(`OCR retry failed for receipt ${id}`);
      throw new BadGatewayException(
        {
          message: 'Receipt OCR extraction failed',
          errorCode: 'OCR_EXTRACTION_FAILED',
        },
        { cause: error }
      );
    }
  }

  async discard(id: string): Promise<ReceiptResponseDto> {
    const receipt = await this.getReceipt(id);
    this.ensurePending(receipt);
    const updated = await this.prisma.receiptDocument.update({
      where: { id },
      data: { status: ReceiptDocumentStatus.discarded },
      include: receiptInclude,
    });
    return this.toResponse(updated);
  }

  async confirmLot(id: string, dto: ConfirmLotDto) {
    const receipt = await this.getReceipt(id);
    this.ensureConfirmable(receipt);
    const createLotDto: CreateLotDto = {
      lotNumber: dto.lotNumber ?? `REC-${id}`,
      supplierId: dto.supplierId,
      notes: dto.notes,
      items: dto.items,
    };
    const lot = await this.lotsService.create(createLotDto);
    if (!lot) {
      throw new Error('Lot creation returned no lot');
    }

    const updated = await this.prisma.receiptDocument.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        lotId: lot.id,
        status: ReceiptDocumentStatus.confirmed,
        confirmedAt: new Date(),
      },
      include: receiptInclude,
    });
    return { lot, receipt: this.toResponse(updated) };
  }

  async confirmPurchaseOrder(id: string, dto: ConfirmPurchaseOrderReceiptDto) {
    const receipt = await this.getReceipt(id);
    this.ensureConfirmable(receipt);
    const purchaseOrderExists = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId, isActive: true },
      select: { id: true },
    });
    if (!purchaseOrderExists) {
      throw new NotFoundException({
        message: 'Purchase order not found',
        errorCode: 'PURCHASE_ORDER_NOT_FOUND',
      });
    }

    const purchaseOrder = await this.purchaseOrdersService.receive(
      dto.purchaseOrderId,
      { lines: dto.lines }
    );
    const updated = await this.prisma.receiptDocument.update({
      where: { id },
      data: {
        purchaseOrderId: dto.purchaseOrderId,
        lotId: purchaseOrder.lotIds[0] ?? null,
        status: ReceiptDocumentStatus.confirmed,
        confirmedAt: new Date(),
      },
      include: receiptInclude,
    });
    return { purchaseOrder, receipt: this.toResponse(updated) };
  }

  private validateFile(file: Express.Multer.File): void {
    if (file.size > RECEIPT_FILE_MAX_SIZE) {
      throw new PayloadTooLargeException({
        message: 'Receipt file must not exceed 10 MB',
        errorCode: 'RECEIPT_FILE_TOO_LARGE',
      });
    }
    if (
      !RECEIPT_FILE_TYPES.includes(
        file.mimetype as (typeof RECEIPT_FILE_TYPES)[number]
      )
    ) {
      throw new UnsupportedMediaTypeException({
        message: 'Receipt file must be a PDF, JPEG, PNG or WEBP',
        errorCode: 'RECEIPT_FILE_TYPE_UNSUPPORTED',
      });
    }
  }

  private async getReceipt(id: string): Promise<ReceiptRecord> {
    const receipt = await this.prisma.receiptDocument.findUnique({
      where: { id },
      include: receiptInclude,
    });
    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found',
        errorCode: 'RECEIPT_NOT_FOUND',
      });
    }
    return receipt;
  }

  private ensurePending(receipt: ReceiptDocument): void {
    if (receipt.status !== ReceiptDocumentStatus.pending) {
      throw new ConflictException({
        message: 'Receipt must be pending for this action',
        errorCode: 'RECEIPT_NOT_PENDING',
      });
    }
  }

  private ensureConfirmable(receipt: ReceiptDocument): void {
    this.ensurePending(receipt);
    if (receipt.lotId) {
      throw new ConflictException({
        message: 'Receipt is already linked to a lot',
        errorCode: 'RECEIPT_ALREADY_CONFIRMED',
      });
    }
    if (receipt.extracted === null) {
      throw new ConflictException({
        message: 'Receipt OCR must succeed before confirmation',
        errorCode: 'RECEIPT_OCR_REQUIRED',
      });
    }
  }

  private ensureOcrConfigured(): void {
    if (!this.ocrService.isConfigured()) {
      throw new ServiceUnavailableException({
        message: 'Receipt OCR is not configured',
        errorCode: 'OCR_NOT_CONFIGURED',
      });
    }
  }

  private async saveOcrResult(id: string, result: ReceiptOcrResult) {
    return this.prisma.receiptDocument.update({
      where: { id },
      data: {
        extracted: result.extraction as unknown as Prisma.InputJsonValue,
        ocrModel: result.model,
        ocrPayload: result.payload as Prisma.InputJsonValue,
      },
      include: receiptInclude,
    });
  }

  private toResponse(receipt: ReceiptRecord): ReceiptResponseDto {
    return {
      id: receipt.id,
      status: receipt.status,
      mimeType: receipt.mimeType,
      fileName: receipt.fileName,
      filePublicId: receipt.filePublicId,
      fileUrl: receipt.fileUrl,
      extracted: receipt.extracted as unknown as ReceiptExtraction | null,
      ocrModel: receipt.ocrModel,
      ocrPayload: receipt.ocrPayload,
      lotId: receipt.lotId,
      lot: receipt.lot,
      purchaseOrderId: receipt.purchaseOrderId,
      purchaseOrder: receipt.purchaseOrder,
      supplierId: receipt.supplierId,
      supplier: receipt.supplier,
      confirmedAt: receipt.confirmedAt,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    };
  }
}
