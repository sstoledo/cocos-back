import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import type { CreateProductDto } from './dto/create-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService
  ) {}

  async findAll() {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: { presentation: true, brand: true, category: true },
    });
    return products.map((product) => this.toResponse(product));
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { presentation: true, brand: true, category: true },
    });
    return product ? this.toResponse(product) : null;
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
    const product = await this.prisma.product.findUnique({ where: { id } });
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
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException();
    }

    const deleted = await this.prisma.product.delete({ where: { id } });
    if (product.imagePublicId) {
      this.uploadService.deleteImage(product.imagePublicId).catch((error) => {
        console.error(`Failed to delete image ${product.imagePublicId}`, error);
      });
    }
    return this.toResponse(deleted);
  }

  async removeImage(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException();
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageUrl: null, imagePublicId: null },
    });
    if (product.imagePublicId) {
      this.uploadService.deleteImage(product.imagePublicId).catch((error) => {
        console.error(`Failed to delete image ${product.imagePublicId}`, error);
      });
    }
    return this.toResponse(updated);
  }

  private toResponse(product: Product): ProductResponseDto {
    return plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
  }

  private async buildProductData<T extends CreateProductDto | UpdateProductDto>(
    dto: T,
    image?: Express.Multer.File
  ): Promise<T & { imageUrl?: string; imagePublicId?: string }> {
    if (!image) {
      return dto;
    }

    const { url, publicId } = await this.uploadService.uploadImage(
      image.buffer,
      'products'
    );
    return { ...dto, imageUrl: url, imagePublicId: publicId };
  }
}
