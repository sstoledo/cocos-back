import {
  ConflictException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReceiptDocumentStatus, RoleName } from '@prisma/client';
import {
  RECEIPT_FILE_REQUIRED_PIPE,
  RECEIPT_FILE_SIZE_PIPE,
  RECEIPT_FILE_TYPE_PIPE,
  ReceiptsController,
} from './receipts.controller';
import type { ReceiptsService } from './receipts.service';

jest.mock('../auth/auth', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('better-auth/node', () => ({ fromNodeHeaders: jest.fn() }));

describe('ReceiptsController', () => {
  let controller: ReceiptsController;
  let service: ReceiptsService;

  const file = {
    buffer: Buffer.from('pdf'),
    mimetype: 'application/pdf',
    originalname: 'invoice.pdf',
    size: 3,
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    service = {
      createReceipt: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      retryOcr: jest.fn(),
      discard: jest.fn(),
      confirmLot: jest.fn(),
      confirmPurchaseOrder: jest.fn(),
    } as unknown as ReceiptsService;
    controller = new ReceiptsController(service);
  });

  it('applies RolesGuard to every endpoint', () => {
    const guards = Reflect.getMetadata('__guards__', ReceiptsController);
    expect(guards).toHaveLength(1);
    expect(guards[0].name).toBe('RolesGuard');
  });

  describe('roles', () => {
    const reflector = new Reflector();
    const writeRoles = [
      RoleName.Admin,
      RoleName.Purchasing,
      RoleName.Warehouse,
    ];
    const readRoles = [
      RoleName.Admin,
      RoleName.Reception,
      RoleName.Mechanic,
      RoleName.Warehouse,
      RoleName.Purchasing,
      RoleName.ReadOnly,
    ];

    it.each(['findAll', 'findOne'] as const)(
      'allows all lot read roles for %s',
      (method) => {
        expect(
          reflector.getAllAndOverride('roles', [
            ReceiptsController.prototype[method],
            ReceiptsController,
          ])
        ).toEqual(readRoles);
      }
    );

    it.each([
      'create',
      'retryOcr',
      'discard',
      'confirmLot',
      'confirmPurchaseOrder',
    ] as const)('restricts %s to lot write roles', (method) => {
      expect(
        reflector.getAllAndOverride('roles', [
          ReceiptsController.prototype[method],
          ReceiptsController,
        ])
      ).toEqual(writeRoles);
    });
  });

  describe('upload validation', () => {
    it('returns 400 when the file is missing', async () => {
      await expect(
        RECEIPT_FILE_REQUIRED_PIPE.transform(undefined as never)
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 413 when the file exceeds 10 MB', async () => {
      await expect(
        RECEIPT_FILE_SIZE_PIPE.transform({
          ...file,
          size: 10 * 1024 * 1024 + 1,
        })
      ).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE });
    });

    it('returns 415 for an unsupported media type', async () => {
      await expect(
        RECEIPT_FILE_TYPE_PIPE.transform({ ...file, mimetype: 'text/plain' })
      ).rejects.toMatchObject({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE });
    });

    it.each(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])(
      'accepts %s',
      async (mimetype) => {
        await expect(
          RECEIPT_FILE_TYPE_PIPE.transform({ ...file, mimetype })
        ).resolves.toMatchObject({ mimetype });
      }
    );
  });

  it('uploads a receipt through the service', async () => {
    const response = { id: 'receipt-1' };
    (service.createReceipt as jest.Mock).mockResolvedValue(response);

    await expect(controller.create(file)).resolves.toEqual(response);
    expect(service.createReceipt).toHaveBeenCalledWith(file);
  });

  it('delegates list filtering and findOne', async () => {
    (service.findAll as jest.Mock).mockResolvedValue([]);
    (service.findOne as jest.Mock).mockResolvedValue({ id: 'receipt-1' });

    await controller.findAll({ status: ReceiptDocumentStatus.discarded });
    await expect(controller.findOne('receipt-1')).resolves.toEqual({
      id: 'receipt-1',
    });
    expect(service.findAll).toHaveBeenCalledWith({
      status: ReceiptDocumentStatus.discarded,
    });
  });

  it('propagates the service 404 response', async () => {
    (service.findOne as jest.Mock).mockRejectedValue(
      new NotFoundException({
        message: 'Receipt not found',
        errorCode: 'RECEIPT_NOT_FOUND',
      })
    );

    await expect(controller.findOne('missing')).rejects.toMatchObject({
      response: { errorCode: 'RECEIPT_NOT_FOUND' },
    });
  });

  it('returns lot and receipt from confirmLot', async () => {
    const result = { lot: { id: 'lot-1' }, receipt: { id: 'receipt-1' } };
    const dto = {
      supplierId: 'supplier-1',
      items: [],
    };
    (service.confirmLot as jest.Mock).mockResolvedValue(result);

    await expect(
      controller.confirmLot('receipt-1', dto as never)
    ).resolves.toEqual(result);
    expect(service.confirmLot).toHaveBeenCalledWith('receipt-1', dto);
  });

  it('delegates purchase-order confirmation and OCR retry', async () => {
    const dto = { purchaseOrderId: 'po-1', lines: [] };
    (service.confirmPurchaseOrder as jest.Mock).mockResolvedValue({});
    (service.retryOcr as jest.Mock).mockResolvedValue({ id: 'receipt-1' });

    await controller.confirmPurchaseOrder('receipt-1', dto as never);
    await controller.retryOcr('receipt-1');

    expect(service.confirmPurchaseOrder).toHaveBeenCalledWith('receipt-1', dto);
    expect(service.retryOcr).toHaveBeenCalledWith('receipt-1');
  });

  it('propagates OCR_NOT_CONFIGURED as a 503 business error', async () => {
    (service.retryOcr as jest.Mock).mockRejectedValue(
      new ServiceUnavailableException({
        message: 'Receipt OCR is not configured',
        errorCode: 'OCR_NOT_CONFIGURED',
      })
    );

    await expect(controller.retryOcr('receipt-1')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { errorCode: 'OCR_NOT_CONFIGURED' },
    });
  });

  it('enforces the service-only-pending discard rule', async () => {
    (service.discard as jest.Mock).mockRejectedValue(
      new ConflictException({
        message: 'Only pending receipts can be discarded',
        errorCode: 'RECEIPT_NOT_PENDING',
      })
    );

    await expect(controller.discard('receipt-1')).rejects.toMatchObject({
      response: { errorCode: 'RECEIPT_NOT_PENDING' },
    });
  });
});
