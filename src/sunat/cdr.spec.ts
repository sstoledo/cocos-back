import { parseCdr } from './cdr-parser';
import { unzipCdr } from './cpe-package';

describe('unzipCdr', () => {
  it('extracts the R-*.xml document from the CDR zip', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('R-F001-1.xml', '<ApplicationResponse/>');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });

    const { fileName, xml } = await unzipCdr(bytes);

    expect(fileName).toBe('R-F001-1.xml');
    expect(xml).toBe('<ApplicationResponse/>');
  });

  it('throws when the zip holds no XML document', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('readme.txt', 'nothing here');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(unzipCdr(bytes)).rejects.toThrow('CDR');
  });
});

describe('parseCdr', () => {
  it('accepts a CDR with ResponseCode 0', () => {
    const cdr = parseCdr(`
      <ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cbc:ID>CDR</cbc:ID>
        <cbc:ResponseCode>0</cbc:ResponseCode>
        <cbc:Description>La Factura numero F001-1, ha sido aceptada</cbc:Description>
      </ApplicationResponse>`);

    expect(cdr).toEqual({
      responseCode: '0',
      description: 'La Factura numero F001-1, ha sido aceptada',
      accepted: true,
    });
  });

  it('reports a rejection with its description when ResponseCode is not 0', () => {
    const cdr = parseCdr(`
      <ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cbc:ID>CDR</cbc:ID>
        <cbc:ResponseCode>3999</cbc:ResponseCode>
        <cbc:Description>La Factura numero F001-1, ha sido rechazada</cbc:Description>
      </ApplicationResponse>`);

    expect(cdr.accepted).toBe(false);
    expect(cdr.responseCode).toBe('3999');
    expect(cdr.description).toContain('rechazada');
  });

  it('throws when the document is not a CDR', () => {
    expect(() => parseCdr('<Invoice/>')).toThrow('CDR');
  });
});
