import { findUbigeo } from '../ubigeo/ubigeo.catalog';
import { montoEnLetras, splitTax } from './amounts';
import type { CpeInvoice } from './cpe-document';

const IGV_PERCENT = '18.00';

/** SUNAT catalog 01: 0101 = venta interna. */
const OPERATION_TYPE_CODE = '0101';

/** SUNAT catalog 05: the IGV tax scheme. */
const IGV_SCHEME_ID = '1000';
const IGV_SCHEME_NAME = 'IGV';
const IGV_TAX_TYPE_CODE = 'VAT';

/** SUNAT catalog 07: 10 = gravado, operación onerosa. */
const IGV_AFFECTATION_CODE = '10';

/** SUNAT catalog 16: 01 = unit price that includes IGV. */
const PRICE_TYPE_INCLUDING_TAX = '01';

/** SUNAT establishment code of the main address. */
const MAIN_ESTABLISHMENT_CODE = '0000';

const money = (n: number) => n.toFixed(2);
const quantity = (n: number) => n.toFixed(2);

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

type LineAmounts = {
  lineTotal: number;
  base: number;
  igv: number;
  unitNet: number;
};

function computeLineAmounts(line: CpeInvoice['lines'][number]): LineAmounts {
  const lineTotal =
    Math.round(line.quantity * line.unitPriceInclusive * 100) / 100;
  const { base, igv } = splitTax(lineTotal);
  return {
    lineTotal,
    base,
    igv,
    unitNet: Math.round((base / line.quantity) * 100) / 100,
  };
}

function taxSchemeXml(): string {
  return `
        <cac:TaxScheme>
          <cbc:ID>${IGV_SCHEME_ID}</cbc:ID>
          <cbc:Name>${IGV_SCHEME_NAME}</cbc:Name>
          <cbc:TaxTypeCode>${IGV_TAX_TYPE_CODE}</cbc:TaxTypeCode>
        </cac:TaxScheme>`;
}

/**
 * Document-level subtotal: mirrors an accepted CPE, which omits the rate and
 * the affectation code here and declares them per line.
 */
function totalTaxSubtotalXml(taxable: number, igv: number): string {
  return `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">${money(taxable)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">${money(igv)}</cbc:TaxAmount>
        <cac:TaxCategory>${taxSchemeXml()}
        </cac:TaxCategory>
      </cac:TaxSubtotal>`;
}

/** Line subtotal: carries the IGV rate and the affectation code. */
function lineTaxSubtotalXml(taxable: number, igv: number): string {
  return `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">${money(taxable)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">${money(igv)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${IGV_PERCENT}</cbc:Percent>
          <cbc:TaxExemptionReasonCode>${IGV_AFFECTATION_CODE}</cbc:TaxExemptionReasonCode>${taxSchemeXml()}
        </cac:TaxCategory>
      </cac:TaxSubtotal>`;
}

function registrationAddressXml(invoice: CpeInvoice): string {
  const ubigeo = findUbigeo(invoice.issuer.ubigeo);
  if (!ubigeo) {
    throw new Error(`Unknown ubigeo code: ${invoice.issuer.ubigeo}`);
  }

  return `
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.issuer.razonSocial)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${ubigeo.code}</cbc:ID>
          <cbc:AddressTypeCode>${MAIN_ESTABLISHMENT_CODE}</cbc:AddressTypeCode>
          <cbc:CityName>${escapeXml(ubigeo.province)}</cbc:CityName>
          <cbc:CountrySubentity>${escapeXml(ubigeo.department)}</cbc:CountrySubentity>
          <cbc:District>${escapeXml(ubigeo.district)}</cbc:District>
          <cac:AddressLine>
            <cbc:Line>${escapeXml(invoice.issuer.address ?? '')}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>`;
}

/**
 * Builds the unsigned UBL 2.1 Invoice XML accepted by SUNAT's billService.
 * Prices stored on sale lines are IGV-inclusive, so the taxable base and the
 * IGV are derived per line and aggregated for the document totals.
 */
export function buildInvoiceXml(invoice: CpeInvoice): string {
  const lineAmounts = invoice.lines.map(computeLineAmounts);

  const totalBase = lineAmounts.reduce((acc, l) => acc + l.base, 0);
  const totalIgv = lineAmounts.reduce((acc, l) => acc + l.igv, 0);
  const total = lineAmounts.reduce((acc, l) => acc + l.lineTotal, 0);

  const linesXml = invoice.lines
    .map((line, index) => {
      const amounts = lineAmounts[index];
      const id = index + 1;
      return `
  <cac:InvoiceLine>
    <cbc:ID>${id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${quantity(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">${money(amounts.base)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="PEN">${money(line.unitPriceInclusive)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>${PRICE_TYPE_INCLUDING_TAX}</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">${money(amounts.igv)}</cbc:TaxAmount>
${lineTaxSubtotalXml(amounts.base, amounts.igv)}
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="PEN">${money(amounts.unitNet)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${invoice.serie}-${invoice.correlativo}</cbc:ID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="${OPERATION_TYPE_CODE}">${invoice.documentType}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000">${montoEnLetras(total)}</cbc:Note>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>${invoice.issuer.ruc}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${invoice.issuer.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.issuer.razonSocial)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignST</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${invoice.issuer.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.issuer.razonSocial)}</cbc:Name>
      </cac:PartyName>${registrationAddressXml(invoice)}
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${invoice.buyer.documentType}">${invoice.buyer.documentNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">${money(totalIgv)}</cbc:TaxAmount>
${totalTaxSubtotalXml(totalBase, totalIgv)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">${money(totalBase)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="PEN">${money(totalBase)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">${money(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">${money(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}
