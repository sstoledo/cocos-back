import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  private readonly cloudName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService
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
        include: {
          presentation: true,
          brand: true,
          category: { include: { parent: true } },
        },
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
      include: {
        presentation: true,
        brand: true,
        category: { include: { parent: true } },
      },
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

    const data = await this.buildProductData(dto, image);

    try {
      const updated = await this.prisma.product.update({ where: { id }, data });
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
