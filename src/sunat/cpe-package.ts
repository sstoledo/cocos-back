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

/** Extracts the R-<serie>-<correlativo>.xml CDR document from the response zip. */
export async function unzipCdr(
  cdrZip: Buffer
): Promise<{ fileName: string; xml: string }> {
  const zip = await JSZip.loadAsync(cdrZip);
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && file.name.endsWith('.xml')
  );

  if (!entry) {
    throw new Error('El CDR de SUNAT no contiene ningún XML');
  }

  return { fileName: entry.name, xml: await entry.async('string') };
}
