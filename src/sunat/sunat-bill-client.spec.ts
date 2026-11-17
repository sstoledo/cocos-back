import { zipInvoice } from './cpe-package';
import { SunatBillClient } from './sunat-bill-client';

const cdrZipB64 = 'Q0RSLVpJUA=='; // "CDR-ZIP"

describe('zipInvoice', () => {
  it('zips the XML under its file name', async () => {
    const zip = await zipInvoice('F001-1.xml', '<Invoice/>');

    const JSZip = (await import('jszip')).default;
    const contents = await JSZip.loadAsync(zip);
    expect(Object.keys(contents.files)).toEqual(['F001-1.xml']);
    await expect(contents.file('F001-1.xml')?.async('string')).resolves.toBe(
      '<Invoice/>'
    );
  });
});

describe('SunatBillClient', () => {
  const buildClient = (overrides: Record<string, string> = {}) => {
    const configService = {
      get: jest.fn((key: string) => overrides[key]),
    } as never;
    return new SunatBillClient(configService);
  };

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('posts a WS-Security envelope with the zipped document to billService', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><applicationResponse xmlns="http://service.sunat.gob.pe/bill/fecore/services/ws/billconsultservice">${cdrZipB64}</applicationResponse></soap:Body></soap:Envelope>`
        ),
    });

    const client = buildClient({
      SUNAT_BILL_SERVICE_URL:
        'https://e-factura-test.sunat.gob.pe/ol-ti-itcpfegem/billService',
      SUNAT_SOL_USER: 'RUC20131312955MODDATOS',
      SUNAT_SOL_PASSWORD: 'sol-pass',
    });

    const zip = await zipInvoice('F001-1.xml', '<Invoice/>');
    const cdr = await client.sendBill('F001-1.xml.zip', zip);

    expect(cdr.cdrZip.toString('utf8')).toBe('CDR-ZIP');
    const call = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(
      'https://e-factura-test.sunat.gob.pe/ol-ti-itcpfegem/billService'
    );

    const body = call[1].body as string;
    expect(body).toContain('sendBill');
    expect(body).toContain('RUC20131312955MODDATOS');
    expect(body).toContain('sol-pass');
    expect(body).toContain('F001-1.xml.zip');
    expect(body).toContain(zip.toString('base64'));
    expect(call[1].headers['Content-Type']).toBe('text/xml; charset=utf-8');
  });

  it('throws ServiceUnavailable when billService is not configured', async () => {
    const client = buildClient({});

    await expect(
      client.sendBill('F001-1.xml.zip', Buffer.from('zip'))
    ).rejects.toMatchObject({ status: 503 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('surfaces SUNAT fault codes as BadGateway with the fault message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Error: La serie o numero del comprobante ya fue enviado anteriormente. Verifique o comuniquese con SUNAT</faultstring><detail><message>2385</message></detail></soap:Fault></soap:Body></soap:Envelope>`
        ),
    });

    const client = buildClient({
      SUNAT_BILL_SERVICE_URL: 'https://x',
      SUNAT_SOL_USER: 'u',
      SUNAT_SOL_PASSWORD: 'p',
    });

    await expect(
      client.sendBill('F001-1.xml.zip', Buffer.from('zip'))
    ).rejects.toThrow('2385');
  });

  it('throws BadGateway when the network request fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = buildClient({
      SUNAT_BILL_SERVICE_URL: 'https://x',
      SUNAT_SOL_USER: 'u',
      SUNAT_SOL_PASSWORD: 'p',
    });

    await expect(
      client.sendBill('F001-1.xml.zip', Buffer.from('zip'))
    ).rejects.toMatchObject({ status: 502 });
  });
});
