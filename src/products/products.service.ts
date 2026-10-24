import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { EmbeddingsService } from '../embeddings';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products-query.dto';
import type { ListSemanticProductsQueryDto } from './dto/list-semantic-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ReindexEmbeddingsResponseDto } from './dto/reindex-response.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_INCLUDE = {
  presentation: true,
  brand: true,
  category: { include: { parent: true } },
} satisfies Prisma.ProductInclude;

const REINDEX_BATCH_SIZE = 50;

interface ProductEmbeddingData {
  name: string;
  description?: string | null;
  code: string;
  brand: { name: string };
  category: { name: string };
}

export function composeProductDocument(product: ProductEmbeddingData): string {
  return [
    product.description ?? '',
    `code: ${product.code}`,
    `meta brand: ${product.brand.name}`,
    `meta category: ${product.category.name}`,
  ].join('\n');
}

export function pgVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

@Injectable()
export class ProductsService {
  private readonly cloudName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
    private readonly embeddingsService: EmbeddingsService
  ) {
    this.cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
  }

  async findAll(queryDto: ListProductsQueryDto) {
    const {
      page = 1,
      limit = 10,
      q,
      categoryId,
      brandId,
      presentationId,
      isActive,
    } = queryDto;
    const where: Prisma.ProductWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (q !== undefined) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }

    if (brandId !== undefined) {
      where.brandId = brandId;
    }

    if (presentationId !== undefined) {
      where.presentationId = presentationId;
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    const stockByProduct = await this.getStockByProductIds(
      data.map((product) => product.id)
    );

    return {
      data: data.map((product) =>
        this.toResponse(product, stockByProduct.get(product.id) ?? 0)
      ),
      meta: { page, limit, total },
    };
  }

  async searchSemantic(queryDto: ListSemanticProductsQueryDto) {
    this.ensureEmbeddingsConfigured();
    const { q, limit = 10, isActive = true } = queryDto;
    const queryEmbedding = await this.embeddingsService.embedQuery(q);
    const vectorText = pgVectorLiteral(queryEmbedding);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products
      WHERE "is_active" = ${isActive}
        AND embedding IS NOT NULL
        AND embedding <=> ${vectorText}::vector < 1
      ORDER BY embedding <=> ${vectorText}::vector
      LIMIT ${limit}
    `;

    if (rows.length === 0) {
      return { data: [] };
    }

    const ids = rows.map((row) => row.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_INCLUDE,
    });
    const productsById = new Map(
      products.map((product) => [product.id, product])
    );
    const orderedProducts = ids.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
    const stockByProduct = await this.getStockByProductIds(
      orderedProducts.map((product) => product.id)
    );

    return {
      data: orderedProducts.map((product) =>
        this.toResponse(product, stockByProduct.get(product.id) ?? 0)
      ),
    };
  }

  private async getStockByProductIds(
    productIds: string[]
  ): Promise<Map<string, number>> {
    const stockByProduct = new Map<string, number>();
    if (productIds.length === 0) {
      return stockByProduct;
    }

    const grouped = await this.prisma.lotItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { remainingQuantity: true },
    });

    for (const row of grouped) {
      stockByProduct.set(row.productId, row._sum.remainingQuantity ?? 0);
    }
    return stockByProduct;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException();
    }
    return this.toResponse(product);
  }

  async create(dto: CreateProductDto, image?: Express.Multer.File) {
    const data = await this.buildProductData(dto, image);

    try {
      const created = await this.prisma.product.create({ data });
      await this.tryEmbedProduct(created.id);
      return this.toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto, image?: Express.Multer.File) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException();
    }

    const shouldReembed = this.hasEmbeddingChanges(product, dto);
    const data = await this.buildProductData(dto, image);

    try {
      const updated = await this.prisma.product.update({ where: { id }, data });
      if (shouldReembed) {
        await this.tryEmbedProduct(id);
      }
      if (image && product.imagePublicId) {
        this.uploadService.deleteImage(product.imagePublicId).catch((error) => {
          console.error(
            `Failed to delete old image ${product.imagePublicId}`,
            error
          );
        });
      }
      return this.toResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  async reindexEmbeddings(): Promise<ReindexEmbeddingsResponseDto> {
    this.ensureEmbeddingsConfigured();
    const missing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products WHERE embedding IS NULL ORDER BY id
    `;
    const totalMissing = missing.length;
    if (totalMissing === 0) {
      return this.toReindexResponse(0, 0, 0);
    }

    const ids = missing.map((row) => row.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_INCLUDE,
    });
    let updated = 0;
    let failed = totalMissing - products.length;

    for (
      let offset = 0;
      offset < products.length;
      offset += REINDEX_BATCH_SIZE
    ) {
      const chunk = products.slice(offset, offset + REINDEX_BATCH_SIZE);
      try {
        const embedded = await this.embeddingsService.embedDocuments(
          chunk.map((product) => ({
            id: product.id,
            title: product.name,
            content: composeProductDocument(product),
          }))
        );
        const statements = embedded.map(
          ({ id, values }) =>
            this.prisma.$executeRaw`
            UPDATE "products"
            SET embedding = ${pgVectorLiteral(values)}::vector
            WHERE id = ${id}
          `
        );
        await this.prisma.$transaction(statements);
        updated += embedded.length;
      } catch (error) {
        failed += chunk.length;
        console.warn(
          `Failed to reindex embeddings for ${chunk.length} products`,
          error
        );
      }
    }

    return this.toReindexResponse(updated, failed, totalMissing);
  }

  async remove(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException();
    }

    const deleted = await this.prisma.product.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return this.toResponse(deleted);
  }

  async removeImage(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException();
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { imagePublicId: null },
    });
    if (product.imagePublicId) {
      this.uploadService.deleteImage(product.imagePublicId).catch((error) => {
        console.error(`Failed to delete image ${product.imagePublicId}`, error);
      });
    }
    return this.toResponse(updated);
  }

  private hasEmbeddingChanges(
    product: Product,
    dto: UpdateProductDto
  ): boolean {
    return (
      ['name', 'description', 'code', 'brandId', 'categoryId'] as const
    ).some(
      (field) => dto[field] !== undefined && dto[field] !== product[field]
    );
  }

  private async tryEmbedProduct(id: string): Promise<void> {
    try {
      if (!this.embeddingsService.isConfigured()) {
        return;
      }
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: PRODUCT_INCLUDE,
      });
      if (!product) {
        throw new Error('Product disappeared before embedding generation');
      }
      const values = await this.embeddingsService.embedDocument(
        product.name,
        composeProductDocument(product)
      );
      await this.prisma.$executeRaw`
        UPDATE "products"
        SET embedding = ${pgVectorLiteral(values)}::vector
        WHERE id = ${id}
      `;
    } catch (error) {
      console.warn(`Failed to generate embedding for product ${id}`, error);
    }
  }

  private ensureEmbeddingsConfigured(): void {
    if (!this.embeddingsService.isConfigured()) {
      throw new ServiceUnavailableException({
        message: 'Embeddings are not configured',
        errorCode: 'EMBEDDINGS_NOT_CONFIGURED',
      });
    }
  }

  private toReindexResponse(
    updated: number,
    failed: number,
    totalMissing: number
  ): ReindexEmbeddingsResponseDto {
    return plainToInstance(
      ReindexEmbeddingsResponseDto,
      { updated, failed, totalMissing },
      { excludeExtraneousValues: true }
    );
  }

  private toResponse(product: Product, stock?: number): ProductResponseDto {
    const response = plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
    response.imageUrl = product.imagePublicId
      ? `https://res.cloudinary.com/${this.cloudName}/image/upload/${product.imagePublicId}`
      : null;
    response.stock = stock;
    return response;
  }

  private async buildProductData<T extends CreateProductDto | UpdateProductDto>(
    dto: T,
    image?: Express.Multer.File
  ): Promise<T & { imagePublicId?: string }> {
    if (!image) {
      return dto;
    }

    const { publicId } = await this.uploadService.uploadImage(
      image.buffer,
      'products'
    );
    return { ...dto, imagePublicId: publicId };
  }
}
