import { XMLParser } from 'fast-xml-parser';

export type CdrResult = {
  responseCode: string;
  description: string | null;
  accepted: boolean;
};

/**
 * Parses SUNAT's CDR (ApplicationResponse): ResponseCode 0 means accepted,
 * any other code is a rejection/observation whose description explains why.
 */
export function parseCdr(xml: string): CdrResult {
  const parsed = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
  }).parse(xml);

  const root = parsed?.ApplicationResponse;
  if (!root) {
    throw new Error('El archivo recibido de SUNAT no es un CDR válido');
  }

  const responseCode = String(root.ResponseCode ?? '');
  const description = root.Description ?? null;

  return {
    responseCode,
    description,
    accepted: responseCode === '0',
  };
}
