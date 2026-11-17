import JSZip from 'jszip';

/**
 * Packs a signed CPE XML into the zip file SUNAT's billService expects:
 * one zip containing exactly the XML, named `<serie>-<correlativo>.xml`.
 */
export function zipInvoice(fileName: string, xml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(fileName, xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}
