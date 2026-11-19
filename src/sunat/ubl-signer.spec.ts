import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';
import type { CpeInvoice } from './cpe-document';
import { buildInvoiceXml } from './ubl-invoice.builder';
import { signInvoiceXml } from './ubl-signer';

const FIXTURES = join(__dirname, '__fixtures__');
const cert = readFileSync(join(FIXTURES, 'test-cert.pem'), 'utf8');
const key = readFileSync(join(FIXTURES, 'test-key.pem'), 'utf8');

const factura: CpeInvoice = {
  documentType: '01',
  serie: 'F001',
  correlativo: 1,
  issueDate: '2026-11-17',
  issueTime: '14:35:09',
  currency: 'PEN',
  issuer: {
    ruc: '20131312955',
    razonSocial: 'TALLER SUPERINTENDENCIA SAC',
    address: 'AV. GARCILASO DE LA VEGA 1472',
    ubigeo: '150101',
  },
  buyer: {
    documentType: '6',
    documentNumber: '20100047218',
    name: 'CLIENTE INDUSTRIAS SAC',
  },
  lines: [
    { description: 'Cambio de aceite', quantity: 1, unitPriceInclusive: 118 },
  ],
};

const extractSignature = (signed: string): string => {
  const match = signed.match(/<ds:Signature[\s\S]*<\/ds:Signature>/);
  if (!match) {
    throw new Error('no ds:Signature found in signed xml');
  }
  return match[0];
};

const verify = (xml: string): boolean => {
  const verifier = new SignedXml({ publicCert: cert });
  verifier.loadSignature(extractSignature(xml));
  return verifier.checkSignature(xml);
};

describe('signInvoiceXml', () => {
  it('places a ds:Signature inside ext:UBLExtensions with the certificate', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);

    expect(signed).toMatch(
      /<ext:UBLExtensions>[\s\S]*<ext:UBLExtension>[\s\S]*<ext:ExtensionContent[^>]*>[\s\S]*<ds:Signature/
    );
    expect(signed).toContain('X509Certificate');
    expect(signed).toContain(factura.issuer.ruc);
  });

  it('uses SHA-256 digests, RSA-SHA256 and exclusive canonicalization', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);

    expect(signed).toContain('http://www.w3.org/2001/04/xmlenc#sha256');
    expect(signed).toContain(
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    );
    expect(signed).toContain('http://www.w3.org/2001/10/xml-exc-c14n#');
  });

  it('signs the whole document with an empty URI, leaving the root untouched', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);

    expect(signed).toContain('URI=""');
    expect(signed).toContain(
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
    );
    // The UBL Invoice root allows no attributes, so a generated Id would make
    // the document schema-invalid.
    expect(signed).not.toMatch(/<Invoice[^>]*\sId="/);
  });

  it('marks the ds:Signature with the Id that cac:Signature points at', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);

    expect(signed).toContain('<ds:Signature Id="SignST"');
    expect(signed).toContain('<cbc:URI>#SignST</cbc:URI>');
  });

  it('verifies against the signing certificate', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);
    expect(verify(signed)).toBe(true);
  });

  it('fails verification when the document is tampered with', () => {
    const signed = signInvoiceXml(buildInvoiceXml(factura), cert, key);
    const tampered = signed.replace('Cambio de aceite', 'Cambio modificado');

    expect(verify(tampered)).toBe(false);
  });
});
