import {
  BadGatewayException,
  ConflictException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ReceiptDocumentStatus } from '@prisma/client';
import type { LotsService } from '../lots/lots.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import type { UploadService } from '../upload/upload.service';
import type { ReceiptOcrService } from './receipt-ocr.service';
import { RECEIPT_FILE_MAX_SIZE, ReceiptsService } from './receipts.service';

const extraction = {
  supplierName: 'Supplier SA',
  documentNumber: 'F-001',
  issueDate: '2026-10-24',
  items: [{ description: 'Oil', code: 'OIL-1', quantity: 2, unitPrice: 10 }],
};

const receipt = {
  id: 'receipt-1',
  status: ReceiptDocumentStatus.pending,
  mimeType: 'application/pdf',
  fileName: 'invoice.pdf',
  filePublicId: 'receipts/file-1',
  fileUrl: 'https://files.example.com/invoice.pdf',
  extracted: extraction,
  ocrModel: 'gemini-3.8-flash',
  ocrPayload: { candidates: [] },
  lotId: null,
  purchaseOrderId: null,
  supplierId: null,
  confirmedAt: null,
  createdAt: new Date('2026-10-24T10:00:00Z'),
  updatedAt: new Date('2026-10-24T10:00:00Z'),
  supplier: null,
  lot: null,
  purchaseOrder: null,
};

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let prisma: PrismaService;
  let uploadService: UploadService;
  let ocrService: ReceiptOcrService;
  let lotsService: LotsService;
  let purchaseOrdersService: PurchaseOrdersService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  const file = {
    buffer: Buffer.from('pdf'),
    mimetype: 'application/pdf',
    originalname: 'invoice.pdf',
    size: 3,
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma = {
      receiptDocument: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrder: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    uploadService = {
      uploadImage: jest.fn().mockResolvedValue({
        url: receipt.fileUrl,
        publicId: receipt.filePublicId,
      }),
    } as unknown as UploadService;
    ocrService = {
      isConfigured: jest.fn().mockReturnValue(true),
      extractDetailed: jest.fn().mockResolvedValue({
        extraction,
        payload: { candidates: [] },
        model: 'gemini-3.8-flash',
      }),
    } as unknown as ReceiptOcrService;
    lotsService = { create: jest.fn() } as unknown as LotsService;
    purchaseOrdersService = {
      receive: jest.fn(),
    } as unknown as PurchaseOrdersService;
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new ReceiptsService(
      prisma,
      uploadService,
      ocrService,
      lotsService,
      purchaseOrdersService
    );
  });

  describe('createReceipt', () => {
    it('uploads to receipts, stores the document and non-fatal OCR result', async () => {
      (prisma.receiptDocument.create as jest.Mock).mockResolvedValue({
        ...receipt,
        extracted: null,
        ocrModel: null,
        ocrPayload: null,
      });
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue(receipt);

      const result = await service.createReceipt(file);

      expect(uploadService.uploadImage).toHaveBeenCalledWith(
        file.buffer,
        'receipts'
      );
      expect(prisma.receiptDocument.create).toHaveBeenCalledWith({
        data: {
          status: ReceiptDocumentStatus.pending,
          mimeType: file.mimetype,
          fileName: file.originalname,
          filePublicId: receipt.filePublicId,
          fileUrl: receipt.fileUrl,
        },
        include: expect.any(Object),
      });
      expect(ocrService.extractDetailed).toHaveBeenCalledWith(
        file.buffer,
        file.mimetype
      );
      expect(prisma.receiptDocument.update).toHaveBeenCalledWith({
        where: { id: receipt.id },
        data: {
          extracted: extraction,
          ocrModel: 'gemini-3.8-flash',
          ocrPayload: { candidates: [] },
        },
        include: expect.any(Object),
      });
      expect(result.extracted).toEqual(extraction);
    });

    it('leaves extraction null when OCR fails without failing the upload', async () => {
      const pending = {
        ...receipt,
        extracted: null,
        ocrModel: null,
        ocrPayload: null,
      };
      (prisma.receiptDocument.create as jest.Mock).mockResolvedValue(pending);
      (ocrService.extractDetailed as jest.Mock).mockRejectedValue(
        new Error('Gemini unavailable')
      );

      await expect(service.createReceipt(file)).resolves.toMatchObject({
        id: receipt.id,
        extracted: null,
      });
      expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('does not call OCR when Gemini is not configured', async () => {
      const pending = { ...receipt, extracted: null, ocrPayload: null };
      (prisma.receiptDocument.create as jest.Mock).mockResolvedValue(pending);
      (ocrService.isConfigured as jest.Mock).mockReturnValue(false);

      await service.createReceipt(file);

      expect(ocrService.extractDetailed).not.toHaveBeenCalled();
    });

    it.each([
      ['text/plain', PayloadTooLargeException],
      ['application/pdf', PayloadTooLargeException],
    ])('validates file limits before upload', async (mimeType, error) => {
      if (mimeType === 'text/plain') {
        await expect(
          service.createReceipt({ ...file, mimetype: mimeType })
        ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      } else {
        await expect(
          service.createReceipt({ ...file, size: RECEIPT_FILE_MAX_SIZE + 1 })
        ).rejects.toBeInstanceOf(error);
      }
      expect(uploadService.uploadImage).not.toHaveBeenCalled();
      expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('lists at most 50 newest receipts with the optional status filter', async () => {
      (prisma.receiptDocument.findMany as jest.Mock).mockResolvedValue([
        receipt,
      ]);

      await expect(
        service.findAll({ status: ReceiptDocumentStatus.pending })
      ).resolves.toHaveLength(1);
      expect(prisma.receiptDocument.findMany).toHaveBeenCalledWith({
        where: { status: ReceiptDocumentStatus.pending },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          supplier: { select: { id: true, name: true } },
          lot: { select: { id: true, lotNumber: true } },
          purchaseOrder: {
            select: { id: true, purchaseOrderNumber: true },
          },
        },
      });
    });

    it('throws a business not-found error for an unknown id', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toMatchObject({
        response: {
          message: 'Receipt not found',
          errorCode: 'RECEIPT_NOT_FOUND',
        },
      });
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('retryOcr', () => {
    it('returns OCR_NOT_CONFIGURED as a 503 business error', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (ocrService.isConfigured as jest.Mock).mockReturnValue(false);

      await expect(service.retryOcr(receipt.id)).rejects.toMatchObject({
        response: {
          message: 'Receipt OCR is not configured',
          errorCode: 'OCR_NOT_CONFIGURED',
        },
      });
      await expect(service.retryOcr(receipt.id)).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects retry after confirmation', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue({
        ...receipt,
        status: ReceiptDocumentStatus.confirmed,
      });

      await expect(service.retryOcr(receipt.id)).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it('returns a typed error when the stored file cannot be fetched', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(service.retryOcr(receipt.id)).rejects.toMatchObject({
        response: { errorCode: 'RECEIPT_FILE_FETCH_FAILED' },
      });
      await expect(service.retryOcr(receipt.id)).rejects.toBeInstanceOf(
        BadGatewayException
      );
    });

    it('extracts bytes from the stored file and saves raw OCR payload', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue(receipt);
      fetchMock.mockResolvedValue({
        ok: true,
        arrayBuffer: jest
          .fn()
          .mockResolvedValue(Uint8Array.from([1, 2]).buffer),
      } as unknown as Response);

      await service.retryOcr(receipt.id);

      expect(fetchMock).toHaveBeenCalledWith(receipt.fileUrl);
      expect(ocrService.extractDetailed).toHaveBeenCalledWith(
        Buffer.from([1, 2]),
        receipt.mimeType
      );
      expect(prisma.receiptDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ocrPayload: { candidates: [] } }),
        })
      );
    });
  });

  describe('discard', () => {
    it('discards a pending receipt', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue({
        ...receipt,
        status: ReceiptDocumentStatus.discarded,
      });

      await expect(service.discard(receipt.id)).resolves.toMatchObject({
        status: ReceiptDocumentStatus.discarded,
      });
    });

    it('does not discard a confirmed receipt', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue({
        ...receipt,
        status: ReceiptDocumentStatus.confirmed,
      });

      await expect(service.discard(receipt.id)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    });
  });

  describe('confirmLot', () => {
    const dto = {
      supplierId: 'supplier-1',
      notes: 'Reviewed',
      items: [
        {
          productId: 'product-1',
          quantity: 2,
          costPrice: 10.25,
          expirationDate: new Date('2027-01-01'),
        },
      ],
    };

    it('reuses LotsService, generates REC-id and links the created lot', async () => {
      const lot = { id: 'lot-1', lotNumber: `REC-${receipt.id}` };
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (lotsService.create as jest.Mock).mockResolvedValue(lot);
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue({
        ...receipt,
        status: ReceiptDocumentStatus.confirmed,
        supplierId: dto.supplierId,
        lotId: lot.id,
        lot: { id: lot.id, lotNumber: lot.lotNumber },
      });

      const result = await service.confirmLot(receipt.id, dto);

      expect(lotsService.create).toHaveBeenCalledWith({
        ...dto,
        lotNumber: `REC-${receipt.id}`,
      });
      expect(prisma.receiptDocument.update).toHaveBeenCalledWith({
        where: { id: receipt.id },
        data: {
          supplierId: dto.supplierId,
          lotId: lot.id,
          status: ReceiptDocumentStatus.confirmed,
          confirmedAt: expect.any(Date),
        },
        include: expect.any(Object),
      });
      expect(result).toEqual({ lot, receipt: expect.any(Object) });
      expect(result.receipt.lotId).toBe(lot.id);
    });

    it('preserves a supplied lot number', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (lotsService.create as jest.Mock).mockResolvedValue({ id: 'lot-1' });
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue(receipt);

      await service.confirmLot(receipt.id, { ...dto, lotNumber: 'LOT-9' });

      expect(lotsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ lotNumber: 'LOT-9' })
      );
    });

    it('requires successful OCR before confirmation', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue({
        ...receipt,
        extracted: null,
      });

      await expect(service.confirmLot(receipt.id, dto)).rejects.toMatchObject({
        response: { errorCode: 'RECEIPT_OCR_REQUIRED' },
      });
      expect(lotsService.create).not.toHaveBeenCalled();
    });

    it('does not double-confirm a receipt with a lot link', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue({
        ...receipt,
        lotId: 'lot-existing',
      });

      await expect(service.confirmLot(receipt.id, dto)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(lotsService.create).not.toHaveBeenCalled();
    });

    it('leaves the receipt pending when lot creation fails', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (lotsService.create as jest.Mock).mockRejectedValue(
        new Error('duplicate lot')
      );

      await expect(service.confirmLot(receipt.id, dto)).rejects.toThrow(
        'duplicate lot'
      );
      expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    });
  });

  describe('confirmPurchaseOrder', () => {
    const dto = {
      purchaseOrderId: 'po-1',
      lines: [
        {
          lineId: 'line-1',
          receivedQty: 2,
          expirationDate: '2027-01-01',
          actualCostPrice: '10.25',
        },
      ],
    };

    it('reuses receive and persists its created lot id', async () => {
      const received = { id: 'po-1', lotIds: ['lot-1'] };
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
        id: 'po-1',
      });
      (purchaseOrdersService.receive as jest.Mock).mockResolvedValue(received);
      (prisma.receiptDocument.update as jest.Mock).mockResolvedValue({
        ...receipt,
        status: ReceiptDocumentStatus.confirmed,
        purchaseOrderId: 'po-1',
        lotId: 'lot-1',
      });

      const result = await service.confirmPurchaseOrder(receipt.id, dto);

      expect(prisma.purchaseOrder.findUnique).toHaveBeenCalledWith({
        where: { id: 'po-1', isActive: true },
        select: { id: true },
      });
      expect(purchaseOrdersService.receive).toHaveBeenCalledWith('po-1', {
        lines: dto.lines,
      });
      expect(prisma.receiptDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseOrderId: 'po-1',
            lotId: 'lot-1',
            status: ReceiptDocumentStatus.confirmed,
          }),
        })
      );
      expect(result).toEqual({
        purchaseOrder: received,
        receipt: expect.any(Object),
      });
    });

    it('does not receive a missing purchase order', async () => {
      (prisma.receiptDocument.findUnique as jest.Mock).mockResolvedValue(
        receipt
      );
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.confirmPurchaseOrder(receipt.id, dto)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(purchaseOrdersService.receive).not.toHaveBeenCalled();
    });
  });
});
