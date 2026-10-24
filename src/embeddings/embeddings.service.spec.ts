import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIMENSIONS, EmbeddingsService } from './embeddings.service';

const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2';

function vector(value: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => value);
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('EmbeddingsService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function createService(apiKey: string | null = 'test-key', model?: string) {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') {
          return apiKey ?? undefined;
        }
        if (key === 'GEMINI_EMBEDDING_MODEL') {
          return model;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    return new EmbeddingsService(configService);
  }

  it('reports whether the Gemini API key is configured', () => {
    expect(createService().isConfigured()).toBe(true);
    expect(createService('').isConfigured()).toBe(false);
    expect(createService(null).isConfigured()).toBe(false);
  });

  it('embeds a document with the exact request shape and extracts values', async () => {
    const values = vector(0.25);
    // Real REST embedContent response: { "embedding": { "values": [...] } }.
    fetchSpy.mockResolvedValue(jsonResponse({ embedding: { values } }));

    await expect(createService().embedDocument(null, 'hello')).resolves.toEqual(
      values
    );

    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}:embedContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': 'test-key',
      },
      body: JSON.stringify({
        content: { parts: [{ text: 'title: none | text: hello' }] },
        output_dimensionality: EMBEDDING_DIMENSIONS,
      }),
    });
  });

  it('uses the asymmetric query prompt prefix', async () => {
    const values = vector(0.5);
    fetchSpy.mockResolvedValue(jsonResponse({ embedding: { values } }));

    await expect(createService().embedQuery('pico y espiga')).resolves.toEqual(
      values
    );

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      content: {
        parts: [{ text: 'task: search result | query: pico y espiga' }],
      },
      output_dimensionality: EMBEDDING_DIMENSIONS,
    });
  });

  it('batch embeds documents and aligns returned ids by index', async () => {
    const values = [vector(0.1), vector(0.2), vector(0.3)];
    fetchSpy.mockResolvedValue(
      jsonResponse({ embeddings: values.map((item) => ({ values: item })) })
    );
    const items = [
      { id: 'product-1', title: 'One', content: 'first' },
      { id: 'product-2', title: null, content: 'second' },
      { id: 'product-3', title: '', content: 'third' },
    ];

    const result = await createService().embedDocuments(items);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'product-1', values: values[0] },
      { id: 'product-2', values: values[1] },
      { id: 'product-3', values: values[2] },
    ]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_URL}:batchEmbedContents`);
    expect(JSON.parse(String(init?.body))).toEqual({
      requests: items.map((item, index) => ({
        model: 'models/gemini-embedding-2',
        content: {
          parts: [
            {
              text: `title: ${index === 0 ? 'One' : 'none'} | text: ${item.content}`,
            },
          ],
        },
        output_dimensionality: EMBEDDING_DIMENSIONS,
      })),
    });
  });

  it('chunks batch requests in groups of 50', async () => {
    fetchSpy.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { requests: unknown[] };
      return jsonResponse({
        embeddings: body.requests.map(() => ({ values: vector(0.1) })),
      });
    });
    const items = Array.from({ length: 51 }, (_, index) => ({
      id: `product-${index}`,
      title: null,
      content: `content-${index}`,
    }));

    const result = await createService().embedDocuments(items);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).requests
    ).toHaveLength(50);
    expect(
      JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).requests
    ).toHaveLength(1);
    expect(result).toHaveLength(51);
    expect(result[50].id).toBe('product-50');
  });

  it('throws a descriptive error including the provider response on failure', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: jest.fn().mockResolvedValue('quota exceeded'),
    } as unknown as Response);

    await expect(createService().embedQuery('oil')).rejects.toThrow(
      'Gemini embedding request failed (429 Too Many Requests): quota exceeded'
    );
  });

  it('rejects malformed embedding responses', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ embeddings: [] }));

    await expect(createService().embedQuery('oil')).rejects.toThrow(
      'Gemini embedding response did not contain a valid embedding'
    );
  });

  it('rejects a batch response whose embedding count does not match', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ embeddings: [{ values: vector(0.1) }] })
    );

    await expect(
      createService().embedDocuments([
        { id: 'product-1', title: null, content: 'first' },
        { id: 'product-2', title: null, content: 'second' },
      ])
    ).rejects.toThrow('Gemini batch embedding response length mismatch');
  });

  it('uses a custom model without changing the fixed vector dimensions', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ embedding: { values: vector(0.1) } })
    );

    await createService('test-key', 'custom-embedding-model').embedQuery('oil');

    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/custom-embedding-model:embedContent'
    );
  });

  it('rejects a single response with the wrong vector length', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ embedding: { values: [0.1, 0.2] } })
    );

    await expect(createService().embedQuery('oil')).rejects.toThrow(
      'Gemini embedding response did not contain a valid embedding'
    );
  });
});
