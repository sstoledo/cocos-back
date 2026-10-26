import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_GEMINI_OCR_MODEL,
  ReceiptOcrError,
  ReceiptOcrService,
} from './receipt-ocr.service';

describe('ReceiptOcrService', () => {
  const extraction = {
    supplier_name: 'Supplier SA',
    document_number: 'F-001',
    issue_date: '2026-10-24',
    items: [
      {
        description: 'Engine oil',
        code: 'OIL-1',
        quantity: 2,
        unit_price: 12.5,
      },
    ],
  };
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  function createService(apiKey = 'secret', model?: string) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return apiKey;
        if (key === 'GEMINI_OCR_MODEL') return model;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new ReceiptOcrService(config);
  }

  function createFastTimeoutService(apiKey = 'secret') {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return apiKey;
        if (key === 'GEMINI_OCR_MODEL') return undefined;
        if (key === 'GEMINI_OCR_TIMEOUT_MS') return '10';
        return undefined;
      }),
    } as unknown as ConfigService;
    return new ReceiptOcrService(config);
  }

  function mockGeminiText(text: string, split = false) {
    const parts = split
      ? text.match(/.{1,8}/g)?.map((part) => ({ text: part }))
      : [{ text }];
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts, role: 'model' } }],
      }),
    } as unknown as Response);
  }

  it('reports missing configuration without changing extraction behavior', async () => {
    const service = createService('   ');

    expect(service.isConfigured()).toBe(false);
    await expect(
      service.extract(Buffer.from('receipt'), 'application/pdf')
    ).rejects.toThrow(ReceiptOcrError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends inline PDF data and the JSON extraction schema to Gemini', async () => {
    mockGeminiText(JSON.stringify(extraction));
    const service = createService();
    const buffer = Buffer.from('pdf bytes');

    await expect(service.extract(buffer, 'application/pdf')).resolves.toEqual({
      supplierName: 'Supplier SA',
      documentNumber: 'F-001',
      issueDate: '2026-10-24',
      items: [
        {
          description: 'Engine oil',
          code: 'OIL-1',
          quantity: 2,
          unitPrice: 12.5,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_OCR_MODEL}:generateContent`
    );
    expect(DEFAULT_GEMINI_OCR_MODEL).toBe('gemini-3.8-flash');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': 'secret',
      },
    });
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0]).toEqual({
      inline_data: {
        mime_type: 'application/pdf',
        data: buffer.toString('base64'),
      },
    });
    expect(body.contents[0].parts[1].text).toContain('YYYY-MM-DD');
    expect(body.contents[0].parts[1].text).toContain('never invent');
    expect(body.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseSchema: {
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
      },
    });
  });

  it('supports images, a configured model, escaped JSON and joined parts', async () => {
    mockGeminiText(JSON.stringify({ ...extraction, items: [] }), true);
    const service = createService('secret', 'gemini-custom');

    await expect(
      service.extract(Buffer.from('image'), 'image/png')
    ).resolves.toEqual({
      supplierName: 'Supplier SA',
      documentNumber: 'F-001',
      issueDate: '2026-10-24',
      items: [],
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      '/gemini-custom:generateContent'
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/png');
  });

  it('normalizes empty optional values to null', async () => {
    mockGeminiText(
      JSON.stringify({
        supplier_name: '',
        document_number: '',
        issue_date: '',
        items: [{ description: 'Oil', code: '', quantity: 1, unit_price: 0 }],
      })
    );

    await expect(
      createService().extract(Buffer.from('image'), 'image/jpeg')
    ).resolves.toEqual({
      supplierName: null,
      documentNumber: null,
      issueDate: null,
      items: [{ description: 'Oil', code: null, quantity: 1, unitPrice: 0 }],
    });
  });

  it('includes status details when Gemini returns a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: jest.fn().mockResolvedValue('quota exceeded'),
    } as unknown as Response);

    await expect(
      createService().extract(Buffer.from('receipt'), 'application/pdf')
    ).rejects.toThrow(
      'Gemini OCR request failed (429 Too Many Requests): quota exceeded'
    );
  });

  it.each([
    ['missing candidates', {}],
    ['missing parts', { candidates: [{ content: {} }] }],
    ['invalid JSON', { candidates: [{ content: { parts: [{ text: '{' }] } }] }],
    [
      'non-finite quantity',
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      {
                        description: 'Oil',
                        quantity: 'two',
                        unit_price: 1,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      },
    ],
  ])('throws a typed error for %s', async (_name, payload) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(payload),
    } as unknown as Response);

    await expect(
      createService().extract(Buffer.from('receipt'), 'application/pdf')
    ).rejects.toBeInstanceOf(ReceiptOcrError);
  });

  it('retries once when Gemini transiently fails and then succeeds', async () => {
    const ok = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(extraction) }] } },
        ],
      }),
    };
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: jest.fn().mockResolvedValue('overloaded'),
      } as unknown as Response)
      .mockResolvedValueOnce(ok as unknown as Response);

    await expect(
      createService().extract(Buffer.from('receipt'), 'image/png')
    ).resolves.toMatchObject({ supplierName: 'Supplier SA' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts hung Gemini requests and fails typed', async () => {
    fetchMock.mockImplementation(
      (_url: string | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(
              Object.assign(new Error('aborted'), { name: 'TimeoutError' })
            )
          );
        })
    );

    await expect(
      createFastTimeoutService().extract(Buffer.from('receipt'), 'image/png')
    ).rejects.toThrow('timed out');
  });
});
