import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// This model affects extraction quality only; it has no stored-vector coupling.
export const DEFAULT_GEMINI_OCR_MODEL = 'gemini-3.8-flash';

// Extraction is expected in seconds; a hung provider must not hold the
// upload response for minutes (the retry path covers persistent failures).
const RECEIPT_OCR_TIMEOUT_MS = 60_000;

const GEMINI_API_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const EXTRACTION_PROMPT = `Read this supplier receipt (factura, boleta or guía).
Return only structured data matching the response schema. Use an empty string
for missing optional fields, quantities and unit prices as numbers, and the
issue date as YYYY-MM-DD. Read every real line item and never invent items.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    supplier_name: { type: 'STRING' },
    document_number: { type: 'STRING' },
    issue_date: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          code: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unit_price: { type: 'NUMBER' },
        },
        required: ['description', 'quantity', 'unit_price'],
      },
    },
  },
  required: ['items'],
};

export interface ReceiptExtractionItem {
  description: string;
  code: string | null;
  quantity: number;
  unitPrice: number;
}

export interface ReceiptExtraction {
  supplierName: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  items: ReceiptExtractionItem[];
}

export interface ReceiptOcrResult {
  extraction: ReceiptExtraction;
  payload: unknown;
  model: string;
}

export class ReceiptOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptOcrError';
  }
}

@Injectable()
export class ReceiptOcrService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.model =
      this.configService.get<string>('GEMINI_OCR_MODEL') ??
      DEFAULT_GEMINI_OCR_MODEL;
    const parsedTimeout = Number(
      this.configService.get<string>('GEMINI_OCR_TIMEOUT_MS')
    );
    this.timeoutMs =
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : RECEIPT_OCR_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async extract(buffer: Buffer, mimeType: string): Promise<ReceiptExtraction> {
    return (await this.extractDetailed(buffer, mimeType)).extraction;
  }

  async extractDetailed(
    buffer: Buffer,
    mimeType: string
  ): Promise<ReceiptOcrResult> {
    // One silent retry: Gemini intermittently 503s; the manual retry
    // endpoint remains for persistent failures.
    let payload: unknown;
    try {
      payload = await this.request(buffer, mimeType);
    } catch {
      payload = await this.request(buffer, mimeType);
    }
    return {
      extraction: this.parseExtraction(payload),
      payload,
      model: this.model,
    };
  }

  private async request(buffer: Buffer, mimeType: string): Promise<unknown> {
    this.ensureConfigured();
    let response: Response;
    try {
      response = await fetch(
        `${GEMINI_API_BASE_URL}/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          // A hung provider request must not block the upload response.
          signal: AbortSignal.timeout(this.timeoutMs),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: buffer.toString('base64'),
                    },
                  },
                  { text: EXTRACTION_PROMPT },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        }
      );
    } catch (error) {
      throw new ReceiptOcrError(
        `Gemini OCR request failed or timed out: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!response.ok) {
      const details = await response.text();
      throw new ReceiptOcrError(
        `Gemini OCR request failed (${response.status} ${response.statusText}): ${details}`
      );
    }
    return (await response.json()) as unknown;
  }

  private parseExtraction(payload: unknown): ReceiptExtraction {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.responseText(payload));
    } catch {
      throw new ReceiptOcrError(
        'Gemini OCR response did not contain valid extraction JSON'
      );
    }

    if (!this.isRecord(parsed) || !Array.isArray(parsed.items)) {
      throw new ReceiptOcrError(
        'Gemini OCR response did not match the extraction schema'
      );
    }

    return {
      supplierName: this.nullableString(parsed.supplier_name),
      documentNumber: this.nullableString(parsed.document_number),
      issueDate: this.nullableString(parsed.issue_date),
      items: parsed.items.map((item) => this.parseItem(item)),
    };
  }

  private responseText(payload: unknown): string {
    if (!this.isRecord(payload) || !Array.isArray(payload.candidates)) {
      throw new ReceiptOcrError('Gemini OCR response has no candidates');
    }
    const candidate = payload.candidates[0];
    if (
      !this.isRecord(candidate) ||
      !this.isRecord(candidate.content) ||
      !Array.isArray(candidate.content.parts)
    ) {
      throw new ReceiptOcrError('Gemini OCR response has no content parts');
    }

    const texts = candidate.content.parts.map((part) => {
      if (!this.isRecord(part) || typeof part.text !== 'string') {
        throw new ReceiptOcrError('Gemini OCR response has an invalid part');
      }
      return part.text;
    });
    return texts.join('');
  }

  private parseItem(value: unknown): ReceiptExtractionItem {
    if (!this.isRecord(value) || typeof value.description !== 'string') {
      throw new ReceiptOcrError('Gemini OCR response contains an invalid item');
    }
    return {
      description: value.description,
      code: this.nullableString(value.code),
      quantity: this.finiteNumber(value.quantity, 'quantity'),
      unitPrice: this.finiteNumber(value.unit_price, 'unit_price'),
    };
  }

  private nullableString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      throw new ReceiptOcrError(
        'Gemini OCR response contains an invalid optional field'
      );
    }
    return value.trim() || null;
  }

  private finiteNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ReceiptOcrError(
        `Gemini OCR response contains an invalid ${field}`
      );
    }
    return value;
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new ReceiptOcrError('Gemini receipt OCR is not configured');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
