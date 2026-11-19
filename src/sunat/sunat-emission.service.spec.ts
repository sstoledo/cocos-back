import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import { SunatEmissionService } from './sunat-emission.service';

const CERT_PATH = join(__dirname, '__fixtures__', 'test-cert.pem');
const KEY_PATH = join(__dirname, '__fixtures__', 'test-key.pem');

const buildPrisma = () => ({
  sale: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  companySettings: {
    findFirst: jest.fn(),
  },
  fiscalNumberSequence: {
    upsert: jest.fn(),
  },
});

const buildBillClient = () => ({
  sendBill: jest.fn(),
});

const buildConfig = (overrides: Record<string, string> = {}) =>
  ({
    get: jest.fn((key: string) => overrides[key]),
  }) as unknown as ConfigService;

const SALE = {
  id: 'sale-1',
  status: 'completed',
  documentType: 'boleta',
  fiscalSeries: null,
  fiscalNumber: null,
  sunatStatus: 'pending',
  totalAmount: 118,
  client: {
    id: 'client-1',
    name: 'Juan Pérez',
    identification: '12345678',
    identificationType: 'DNI',
  },
  products: [
    {
      quantity: 1,
      unitPriceSnapshot: 118,
      subtotal: 118,
      product: { name: 'Cambio de aceite' },
    },
  ],
};

const buildService = (
  prisma = buildPrisma(),
  billClient = buildBillClient(),
  configOverrides: Record<string, string> = {}
) =>
  new SunatEmissionService(
    prisma as never,
    new FiscalNumberingService(prisma as never),
    billClient as never,
    buildConfig(configOverrides)
  );

import { FiscalNumberingService } from './fiscal-numbering.service';

const cdrZipFor = async (xml: string): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file('R-F001-1.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer' });
};

let acceptedCdr: Buffer;
const getAcceptedCdr = async (): Promise<Buffer> => {
  if (!acceptedCdr) {
    acceptedCdr = await cdrZipFor(
      `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>CDR</cbc:ID><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>La Boleta numero B001-1, ha sido aceptada</cbc:Description></ApplicationResponse>`
    );
  }
  return acceptedCdr;
};

const SETTINGS = {
  id: 'settings-1',
  ruc: '20131312955',
  legalName: 'TALLER SUPERINTENDENCIA SAC',
  address: 'AV. GARCILASO 1472',
  facturaSeries: 'F001',
  boletaSeries: 'B001',
};

describe('SunatEmissionService', () => {
  it('emits a boleta end to end and marks the sale accepted', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      serie: 'B001',
      lastNumber: 1,
    });
    const billClient = buildBillClient();
    billClient.sendBill.mockResolvedValue({ cdrZip: await getAcceptedCdr() });

    const service = buildService(prisma, billClient, {
      SUNAT_BILL_SERVICE_URL:
        'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
      SUNAT_SOL_USER: 'RUC20131312955MODDATOS',
      SUNAT_SOL_PASSWORD: 'sol',
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    const result = await service.emit('sale-1');

    expect(result).toMatchObject({
      serie: 'B001',
      correlativo: 1,
      sunatStatus: 'accepted',
      description: 'La Boleta numero B001-1, ha sido aceptada',
    });

    expect(billClient.sendBill).toHaveBeenCalledWith(
      '20131312955-03-B001-1.zip',
      expect.anything()
    );

    const update = prisma.sale.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'sale-1' });
    expect(update.data).toMatchObject({
      fiscalSeries: 'B001',
      fiscalNumber: 1,
      documentType: 'boleta',
      sunatStatus: 'accepted',
    });
  });

  it('sends a signed UBL invoice with the mapped buyer and totals', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      serie: 'B001',
      lastNumber: 1,
    });
    const billClient = buildBillClient();
    billClient.sendBill.mockResolvedValue({ cdrZip: await getAcceptedCdr() });

    const service = buildService(prisma, billClient, {
      SUNAT_BILL_SERVICE_URL: 'https://x',
      SUNAT_SOL_USER: 'u',
      SUNAT_SOL_PASSWORD: 'p',
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    await service.emit('sale-1');

    const sentZip = billClient.sendBill.mock.calls[0][1] as Buffer;
    const zip = await JSZip.loadAsync(sentZip);
    const xml =
      (await zip.file('20131312955-03-B001-1.xml')?.async('string')) ?? '';

    expect(xml).toContain('<ds:Signature');
    expect(xml).toContain('<cbc:ID>B001-1</cbc:ID>');
    expect(xml).toContain('Cambio de aceite');
    expect(xml).toContain('SON: CIENTO DIECIOCHO CON 00/100 SOLES');
    expect(xml).toContain('20131312955');
  });

  it('rejects a sale already emitted without touching SUNAT', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue({
      ...SALE,
      sunatStatus: 'accepted',
      fiscalSeries: 'B001',
      fiscalNumber: 1,
    });
    const billClient = buildBillClient();

    const service = buildService(prisma, billClient, {
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    await expect(service.emit('sale-1')).rejects.toThrow(ConflictException);
    expect(billClient.sendBill).not.toHaveBeenCalled();
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });

  it('rejects a sale without a defined fiscal document type', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue({
      ...SALE,
      documentType: null,
    });

    const service = buildService(prisma, buildBillClient(), {});

    await expect(service.emit('sale-1')).rejects.toThrow(BadRequestException);
  });

  it('requires the client RUC for facturas', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue({
      ...SALE,
      documentType: 'factura',
      client: {
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      },
    });
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);

    const service = buildService(prisma, buildBillClient(), {
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    await expect(service.emit('sale-1')).rejects.toThrow(BadRequestException);
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });

  it('requires company fiscal identity before emitting', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(null);
    const billClient = buildBillClient();

    const service = buildService(prisma, billClient, {
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    await expect(service.emit('sale-1')).rejects.toThrow(
      ServiceUnavailableException
    );
    expect(billClient.sendBill).not.toHaveBeenCalled();
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });

  it('requires certificate configuration before emitting', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);
    const billClient = buildBillClient();

    const service = buildService(prisma, billClient, {});

    await expect(service.emit('sale-1')).rejects.toThrow(
      ServiceUnavailableException
    );
    expect(billClient.sendBill).not.toHaveBeenCalled();
  });

  it('marks the sale rejected when the CDR reports a rejection', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      serie: 'B001',
      lastNumber: 1,
    });
    const billClient = buildBillClient();
    const rejectedCdr = await cdrZipFor(
      `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>CDR</cbc:ID><cbc:ResponseCode>3999</cbc:ResponseCode><cbc:Description>La Boleta numero B001-1, ha sido rechazada</cbc:Description></ApplicationResponse>`
    );
    billClient.sendBill.mockResolvedValue({ cdrZip: rejectedCdr });

    const service = buildService(prisma, billClient, {
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    const result = await service.emit('sale-1');

    expect(result.sunatStatus).toBe('rejected');
    const update = prisma.sale.update.mock.calls[0][0];
    expect(update.data.sunatStatus).toBe('rejected');
  });

  it('leaves the sale untouched when SUNAT transport fails', async () => {
    const prisma = buildPrisma();
    prisma.sale.findFirst.mockResolvedValue(SALE);
    prisma.companySettings.findFirst.mockResolvedValue(SETTINGS);
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      serie: 'B001',
      lastNumber: 1,
    });
    const billClient = buildBillClient();
    billClient.sendBill.mockRejectedValue(new Error('ECONNREFUSED'));

    const service = buildService(prisma, billClient, {
      SUNAT_CERT_PATH: CERT_PATH,
      SUNAT_CERT_KEY_PATH: KEY_PATH,
    });

    await expect(service.emit('sale-1')).rejects.toThrow('ECONNREFUSED');
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });
});
