import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';

/**
 * Namespace of the `billService` operation elements, as declared by the
 * service's WSDL (`soap:address` at
 * https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl). Not to be
 * confused with the namespace of the comprobante-consulta service.
 */
const BILL_SERVICE_NAMESPACE = 'http://service.sunat.gob.pe';

/** SOAP action declared by the WSDL for `sendBill`. */
const SEND_BILL_SOAP_ACTION = 'urn:sendBill';

const REQUEST_TIMEOUT_MS = 30_000;

const envelope = (
  fileName: string,
  contentBase64: string,
  user: string,
  password: string
): string => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${BILL_SERVICE_NAMESPACE}">
  <soapenv:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${user}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <ser:fileName>${fileName}</ser:fileName>
      <ser:contentFile>${contentBase64}</ser:contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;

/**
 * Minimal HTTP client for SUNAT's billService (SEE). Sends one zipped CPE per
 * call with WS-Security UsernameToken over the SOL credentials and returns the
 * raw CDR zip bytes from the response. Failures map to HTTP-ish exceptions the
 * emission layer can surface; no retry logic here on purpose (resending an
 * emitted document must be an explicit user action).
 */
@Injectable()
export class SunatBillClient {
  constructor(private readonly configService: ConfigService) {}

  async sendBill(fileName: string, zip: Buffer): Promise<{ cdrZip: Buffer }> {
    const url = this.configService.get<string>('SUNAT_BILL_SERVICE_URL');
    const user = this.configService.get<string>('SUNAT_SOL_USER');
    const password = this.configService.get<string>('SUNAT_SOL_PASSWORD');

    if (!url || !user || !password) {
      throw new ServiceUnavailableException(
        'La emisión de comprobantes no está configurada'
      );
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: SEND_BILL_SOAP_ACTION,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: envelope(fileName, zip.toString('base64'), user, password),
      });
    } catch {
      throw new BadGatewayException('El servicio de SUNAT no está disponible');
    }

    const text = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
    });
    const parsed = parser.parse(text);

    const applicationResponse = parsed?.Envelope?.Body?.applicationResponse;
    if (response.ok && applicationResponse) {
      return { cdrZip: Buffer.from(applicationResponse, 'base64') };
    }

    const fault = parsed?.Envelope?.Body?.Fault;
    const faultstring = fault?.faultstring;
    const code = fault?.detail?.message;
    const faultMessage =
      code && faultstring
        ? `${code}: ${faultstring}`
        : (faultstring ??
          code ??
          `Respuesta inesperada de SUNAT (HTTP ${response.status})`);
    throw new BadGatewayException(faultMessage);
  }
}
