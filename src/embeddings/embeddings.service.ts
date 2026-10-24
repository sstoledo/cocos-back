import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Fixed by the products.embedding vector(768) column. Changing the model or
// dimensions requires re-embedding the catalog and migrating the column.
export const EMBEDDING_DIMENSIONS = 768;

const GEMINI_API_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const BATCH_SIZE = 50;

interface EmbeddingDocument {
  id: string;
  title: string | null;
  content: string;
}

@Injectable()
export class EmbeddingsService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.model =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ??
      'gemini-embedding-2';
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async embedDocument(
    title: string | null,
    content: string
  ): Promise<number[]> {
    const text = this.documentText(title, content);
    const response = await this.request('embedContent', {
      content: { parts: [{ text }] },
      output_dimensionality: EMBEDDING_DIMENSIONS,
    });
    return this.extractEmbedding(response);
  }

  async embedQuery(query: string): Promise<number[]> {
    const response = await this.request('embedContent', {
      content: {
        parts: [{ text: `task: search result | query: ${query}` }],
      },
      output_dimensionality: EMBEDDING_DIMENSIONS,
    });
    return this.extractEmbedding(response);
  }

  async embedDocuments(
    items: EmbeddingDocument[]
  ): Promise<Array<{ id: string; values: number[] }>> {
    if (items.length === 0) {
      return [];
    }

    const embedded: Array<{ id: string; values: number[] }> = [];
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const response = await this.request('batchEmbedContents', {
        requests: chunk.map((item) => ({
          model: `models/${this.model}`,
          content: {
            parts: [{ text: this.documentText(item.title, item.content) }],
          },
          output_dimensionality: EMBEDDING_DIMENSIONS,
        })),
      });
      const embeddings = this.extractBatchEmbeddings(response, chunk.length);
      embedded.push(
        ...chunk.map((item, index) => ({
          id: item.id,
          values: embeddings[index],
        }))
      );
    }
    return embedded;
  }

  private documentText(title: string | null, content: string): string {
    return `title: ${title?.trim() || 'none'} | text: ${content}`;
  }

  private async request(
    operation: 'embedContent' | 'batchEmbedContents',
    body: unknown
  ): Promise<unknown> {
    this.ensureConfigured();
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/${this.model}:${operation}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Gemini embedding request failed (${response.status} ${response.statusText}): ${details}`
      );
    }
    return (await response.json()) as unknown;
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Gemini embeddings are not configured');
    }
  }

  private extractEmbedding(payload: unknown): number[] {
    const embeddings = this.extractEmbeddings(payload);
    if (embeddings.length !== 1) {
      throw new Error(
        'Gemini embedding response did not contain a valid embedding'
      );
    }
    return embeddings[0];
  }

  private extractBatchEmbeddings(
    payload: unknown,
    expectedLength: number
  ): number[][] {
    const embeddings = this.extractEmbeddings(payload);
    if (embeddings.length !== expectedLength) {
      throw new Error('Gemini batch embedding response length mismatch');
    }
    return embeddings;
  }

  private extractEmbeddings(payload: unknown): number[][] {
    if (!this.isRecord(payload) || !Array.isArray(payload.embeddings)) {
      throw new Error(
        'Gemini embedding response did not contain a valid embedding'
      );
    }

    return payload.embeddings.map((entry) => {
      if (
        !this.isRecord(entry) ||
        !Array.isArray(entry.values) ||
        entry.values.length !== EMBEDDING_DIMENSIONS ||
        !entry.values.every(
          (value) => typeof value === 'number' && Number.isFinite(value)
        )
      ) {
        throw new Error(
          'Gemini embedding response did not contain a valid embedding'
        );
      }
      return entry.values;
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
