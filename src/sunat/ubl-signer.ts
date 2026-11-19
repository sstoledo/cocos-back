import { SignedXml } from 'xml-crypto';

const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

/**
 * Signs a UBL invoice the way SUNAT's billService expects: a XAdES-EPES-style
 * enveloped XMLDSig signature placed inside ext:UBLExtensions, covering the
 * whole document with the enveloped transform and exclusive canonicalization.
 *
 * The cert/key pair is the issuer's digital certificate (env config in
 * production; a test-only fixture in the test suite).
 */
export function signInvoiceXml(
  unsignedXml: string,
  certPem: string,
  keyPem: string
): string {
  const signer = new SignedXml({
    publicCert: certPem,
    privateKey: keyPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: EXC_C14N,
  });

  signer.addReference({
    xpath: "//*[local-name(.)='Invoice']",
    transforms: [ENVELOPED, EXC_C14N],
    digestAlgorithm: SHA256,
    // The UBL Invoice root allows no attributes, so the reference must be the
    // empty URI (the whole document) instead of a generated Id.
    isEmptyUri: true,
    inclusiveNamespacesPrefixList: [],
  });

  signer.computeSignature(unsignedXml, {
    prefix: 'ds',
    // cac:Signature points at #SignST; the Id lives on ds:Signature, which
    // XMLDSig allows, because ext:ExtensionContent does not.
    attrs: { Id: 'SignST' },
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: 'append',
    },
  });

  return signer.getSignedXml();
}
