/** Party emitting the CPE (our company, Fase 0 CompanySettings data). */
export type CpeIssuer = {
  ruc: string;
  razonSocial: string;
  address: string | null;
};

/** SUNAT identity document type codes: 6 = RUC, 1 = DNI. */
export type CpeBuyer = {
  documentType: '1' | '6';
  documentNumber: string;
  name: string;
};

/**
 * A sale line as stored (prices IGV-inclusive). The builder derives the
 * taxable base and IGV per line from the stored inclusive amounts.
 */
export type CpeLine = {
  description: string;
  quantity: number;
  unitPriceInclusive: number;
};

/** SUNAT invoice type codes: 01 = Factura, 03 = Boleta. */
export type CpeDocumentType = '01' | '03';

export type CpeInvoice = {
  documentType: CpeDocumentType;
  serie: string;
  correlativo: number;
  /** ISO date, e.g. 2026-11-17. */
  issueDate: string;
  currency: 'PEN';
  issuer: CpeIssuer;
  buyer: CpeBuyer;
  lines: CpeLine[];
};
