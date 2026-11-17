import { XMLParser } from 'fast-xml-parser';
import type { CpeInvoice } from './cpe-document';
import { buildInvoiceXml } from './ubl-invoice.builder';

const parse = (xml: string) =>
  new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
  }).parse(xml);

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

const factura: CpeInvoice = {
  documentType: '01',
  serie: 'F001',
  correlativo: 7,
  issueDate: '2026-11-17',
  currency: 'PEN',
  issuer: {
    ruc: '20131312955',
    razonSocial: 'TALLER SUPERINTENDENCIA SAC',
    address: 'AV. GARCILASO DE LA VEGA 1472',
  },
  buyer: {
    documentType: '6',
    documentNumber: '20100047218',
    name: 'CLIENTE INDUSTRIAS SAC',
  },
  lines: [
    {
      description: 'Cambio de aceite',
      quantity: 1,
      unitPriceInclusive: 118,
    },
    {
      description: 'Filtro <original>',
      quantity: 2,
      unitPriceInclusive: 59,
    },
  ],
};

describe('buildInvoiceXml', () => {
  it('emits a UBL 2.1 Invoice with serie-correlativo, type code and date', () => {
    const doc = parse(buildInvoiceXml(factura));

    expect(doc.Invoice).toBeDefined();
    expect(doc.Invoice.UBLVersionID).toBe('2.1');
    expect(doc.Invoice.CustomizationID).toBe('2.0');
    expect(doc.Invoice.ID).toBe('F001-7');
    expect(doc.Invoice.InvoiceTypeCode).toBe('01');
    expect(doc.Invoice.DocumentCurrencyCode).toBe('PEN');
    expect(doc.Invoice.IssueDate).toBe('2026-11-17');
  });

  it('identifies the issuer with its RUC and legal name', () => {
    const doc = parse(buildInvoiceXml(factura));

    const supplier = doc.Invoice.AccountingSupplierParty.Party;
    expect(supplier.PartyIdentification.ID).toBe('20131312955');
    expect(supplier.PartyName.Name).toBe('TALLER SUPERINTENDENCIA SAC');
    expect(supplier.PostalAddress.Line).toBe('AV. GARCILASO DE LA VEGA 1472');
  });

  it('identifies the buyer with its SUNAT document type', () => {
    const doc = parse(buildInvoiceXml(factura));

    const customer = doc.Invoice.AccountingCustomerParty;
    expect(customer.Party.PartyIdentification.ID).toBe('20100047218');
    expect(customer.Party.PartyLegalEntity.RegistrationName).toBe(
      'CLIENTE INDUSTRIAS SAC'
    );
  });

  it('derives per-line taxable base and IGV from inclusive amounts', () => {
    const doc = parse(buildInvoiceXml(factura));

    const lines = toArray(doc.Invoice.InvoiceLine);
    expect(lines).toHaveLength(2);

    expect(lines[0].ID).toBe('1');
    expect(lines[0].InvoicedQuantity).toBe('1.00');
    // 118 IGV-inclusive -> 100 base.
    expect(lines[0].LineExtensionAmount).toBe('100.00');
    expect(lines[0].Price.PriceAmount).toBe('100.00');
    expect(lines[0].TaxTotal.TaxAmount).toBe('18.00');

    // 59 x 2 = 118 inclusive -> 100 base total for the line.
    expect(lines[1].LineExtensionAmount).toBe('100.00');
    expect(lines[1].Price.PriceAmount).toBe('50.00');
  });

  it('aggregates monetary totals from the line amounts', () => {
    const doc = parse(buildInvoiceXml(factura));

    const totals = doc.Invoice.LegalMonetaryTotal;
    expect(totals.LineExtensionAmount).toBe('200.00');
    expect(totals.TaxExclusiveAmount).toBe('200.00');
    expect(totals.TaxInclusiveAmount).toBe('236.00');
    expect(totals.PayableAmount).toBe('236.00');

    const taxTotal = toArray(doc.Invoice.TaxTotal);
    expect(taxTotal[0].TaxAmount).toBe('36.00');
  });

  it('includes the amount-in-words legend required by SUNAT', () => {
    const doc = parse(buildInvoiceXml(factura));

    const note = toArray(doc.Invoice.Note);
    expect(note[0]).toBe('SON: DOSCIENTOS TREINTA Y SEIS CON 00/100 SOLES');
  });

  it('uses type code 03 for boletas', () => {
    const doc = parse(
      buildInvoiceXml({
        ...factura,
        documentType: '03',
        serie: 'B001',
        correlativo: 1,
        buyer: {
          documentType: '1',
          documentNumber: '12345678',
          name: 'Juan Pérez',
        },
      })
    );

    expect(doc.Invoice.InvoiceTypeCode).toBe('03');
    expect(doc.Invoice.ID).toBe('B001-1');
    expect(
      doc.Invoice.AccountingCustomerParty.Party.PartyIdentification.ID
    ).toBe('12345678');
  });

  it('escapes XML special characters in line descriptions', () => {
    const xml = buildInvoiceXml(factura);

    expect(xml).toContain('Filtro &lt;original&gt;');
    expect(parse(xml).Invoice.InvoiceLine[1].Item.Description).toBe(
      'Filtro <original>'
    );
  });
});
