import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { parseCdr } from './cdr-parser';
import type { CpeInvoice } from './cpe-document';
import { unzipCdr, zipInvoice } from './cpe-package';
import { FiscalNumberingService } from './fiscal-numbering.service';
import { SunatBillClient } from './sunat-bill-client';
import { buildInvoiceXml } from './ubl-invoice.builder';
import { signInvoiceXml } from './ubl-signer';

export type EmissionResult = {
  serie: string;
  correlativo: number;
  sunatStatus: 'accepted' | 'rejected';
  description: string | null;
};

/** SUNAT identity document codes: 6 = RUC, 1 = DNI. */
const BUYER_DOC_TYPE: Record<string, '1' | '6'> = {
  DNI: '1',
  RUC: '6',
};

/**
 * Orchestrates one CPE emission: numbering, UBL build, signature, zip, SOAP
 * send, CDR parse and sale state update. Stock and totals are never mutated:
 * emission is read-only over the sale except for the fiscal fields.
 *
 * Numbering is reserved before the external call. If transport fails after
 * SUNAT received the document, the correlativo stays consumed on purpose:
 * resending the same content with a new number would be wrong, and a reused
 * number with different content is rejected by SUNAT (code 2385).
 */
@Injectable()
export class SunatEmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: FiscalNumberingService,
    private readonly billClient: SunatBillClient,
    private readonly configService: ConfigService
  ) {}

  async emit(saleId: string): Promise<EmissionResult> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, deletedAt: null },
      include: {
        client: true,
        products: { include: { product: true } },
      },
    });

    if (!sale) {
      throw new BadRequestException('La venta no existe');
    }
    if (sale.sunatStatus !== 'pending') {
      throw new ConflictException(
        `La venta ya fue emitida a SUNAT (${sale.fiscalSeries}-${sale.fiscalNumber})`
      );
    }
    if (!sale.documentType) {
      throw new BadRequestException(
        'La venta no define el tipo de comprobante (factura o boleta)'
      );
    }
    if (sale.status !== 'completed') {
      throw new BadRequestException('Solo se emiten ventas completadas');
    }

    const { certPem, keyPem } = this.loadCertificate();
    const settings = await this.loadCompanySettings();

    const serie =
      sale.documentType === 'factura'
        ? settings.facturaSeries
        : settings.boletaSeries;

    const buyer = this.mapBuyer(sale.documentType, sale.client);

    const invoice: CpeInvoice = {
      documentType: sale.documentType === 'factura' ? '01' : '03',
      serie,
      correlativo: 0, // replaced by the reserved numbering below
      issueDate: new Date().toISOString().slice(0, 10),
      currency: 'PEN',
      issuer: {
        ruc: settings.ruc,
        razonSocial: settings.legalName,
        address: settings.address,
      },
      buyer,
      lines: sale.products.map((item) => ({
        description: item.product.name,
        quantity: item.quantity,
        unitPriceInclusive: Number(item.unitPriceSnapshot),
      })),
    };

    const { serie: usedSerie, correlativo } =
      await this.numbering.nextNumber(serie);
    invoice.correlativo = correlativo;

    const xml = signInvoiceXml(buildInvoiceXml(invoice), certPem, keyPem);
    const zip = await zipInvoice(`${usedSerie}-${correlativo}.xml`, xml);

    const { cdrZip } = await this.billClient.sendBill(
      `${usedSerie}-${correlativo}.xml.zip`,
      zip
    );

    const unzipped = await unzipCdr(cdrZip);
    const cdr = parseCdr(unzipped.xml);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        fiscalSeries: usedSerie,
        fiscalNumber: correlativo,
        documentType: sale.documentType,
        sunatStatus: cdr.accepted ? 'accepted' : 'rejected',
      },
    });

    return {
      serie: usedSerie,
      correlativo,
      sunatStatus: cdr.accepted ? 'accepted' : 'rejected',
      description: cdr.description,
    };
  }

  private async loadCompanySettings() {
    const settings = await this.prisma.companySettings.findFirst();
    if (!settings?.ruc || !settings.legalName) {
      throw new ServiceUnavailableException(
        'Configura el RUC y la razón social de la empresa en Configuración → Empresa antes de emitir'
      );
    }
    // Explicit return: TS property narrowing is lost across the function
    // boundary, so re-shape to guarantee non-null ruc/legalName.
    return {
      ruc: settings.ruc,
      legalName: settings.legalName,
      address: settings.address,
      facturaSeries: settings.facturaSeries,
      boletaSeries: settings.boletaSeries,
    };
  }

  private loadCertificate(): { certPem: string; keyPem: string } {
    const certPath = this.configService.get<string>('SUNAT_CERT_PATH');
    const keyPath = this.configService.get<string>('SUNAT_CERT_KEY_PATH');
    const password = this.configService.get<string>('SUNAT_CERT_PASSWORD');

    if (!certPath || !keyPath) {
      throw new ServiceUnavailableException(
        'La emisión de comprobantes no está configurada (falta el certificado digital)'
      );
    }

    try {
      const certPem = readFileSync(certPath, 'utf8');
      let keyPem = readFileSync(keyPath, 'utf8');
      if (password) {
        keyPem = createPrivateKey({ key: keyPem, passphrase: password })
          .export({ type: 'pkcs8', format: 'pem' })
          .toString();
      }
      return { certPem, keyPem };
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo cargar el certificado digital para SUNAT'
      );
    }
  }

  private mapBuyer(
    documentType: string | null,
    client: {
      name: string;
      identification: string | null;
      identificationType: string | null;
    } | null
  ): CpeInvoice['buyer'] {
    if (!client || !client.identification) {
      throw new BadRequestException(
        'La venta no tiene un cliente con documento de identidad para emitir'
      );
    }

    const docType = BUYER_DOC_TYPE[client.identificationType ?? ''];
    if (!docType) {
      throw new BadRequestException(
        `El tipo de identificación ${client.identificationType ?? 'desconocido'} no es válido para emitir`
      );
    }
    if (documentType === 'factura' && docType !== '6') {
      throw new BadRequestException('Una factura requiere el RUC del cliente');
    }

    return {
      documentType: docType,
      documentNumber: client.identification,
      name: client.name,
    };
  }
}
