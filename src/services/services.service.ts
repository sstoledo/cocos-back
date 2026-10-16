import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Service } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceProductDto } from './dto/create-service-product.dto';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { ListServicesQueryDto } from './dto/list-services-query.dto';
import { ServiceProductResponseDto } from './dto/service-product-response.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
import type { UpdateServiceProductDto } from './dto/update-service-product.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceDto) {
    try {
      const service = await this.prisma.service.create({ data: dto });
      return this.toResponse(service);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(queryDto: ListServicesQueryDto) {
    const { query, page = 1, limit = 10 } = queryDto;
    const where: Prisma.ServiceWhereInput = { isActive: true };

    if (query) {
      where.OR = [
        { code: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data: data.map((service) => this.toResponse(service)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id, isActive: true },
    });
    if (!service) {
      throw new NotFoundException();
    }
    return this.toResponse(service);
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);

    try {
      const service = await this.prisma.service.update({
        where: { id },
        data: dto,
      });
      return this.toResponse(service);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    const service = await this.prisma.service.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return this.toResponse(service);
  }

  async listRecipe(serviceId: string) {
    await this.findOne(serviceId);

    const lines = await this.prisma.serviceProduct.findMany({
      where: { serviceId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });

    return lines.map((line) => this.toRecipeResponse(line));
  }

  async addRecipeLine(serviceId: string, dto: CreateServiceProductDto) {
    await this.findOne(serviceId);
    await this.ensureProductExists(dto.productId);

    try {
      const line = await this.prisma.serviceProduct.create({
        data: { serviceId, productId: dto.productId, quantity: dto.quantity },
        include: { product: true },
      });
      return this.toRecipeResponse(line);
    } catch (error) {
      this.handleRecipePrismaError(error);
    }
  }

  async updateRecipeLine(
    serviceId: string,
    productId: string,
    dto: UpdateServiceProductDto
  ) {
    await this.findRecipeLine(serviceId, productId);

    const line = await this.prisma.serviceProduct.update({
      where: { serviceId_productId: { serviceId, productId } },
      data: { quantity: dto.quantity },
      include: { product: true },
    });
    return this.toRecipeResponse(line);
  }

  async removeRecipeLine(serviceId: string, productId: string) {
    await this.findRecipeLine(serviceId, productId);

    await this.prisma.serviceProduct.delete({
      where: { serviceId_productId: { serviceId, productId } },
    });
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, isActive: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'Product not found or inactive',
        errorCode: 'PRODUCT_NOT_FOUND',
      });
    }
  }

  private async findRecipeLine(serviceId: string, productId: string) {
    await this.findOne(serviceId);

    const line = await this.prisma.serviceProduct.findUnique({
      where: { serviceId_productId: { serviceId, productId } },
      include: { product: true },
    });
    if (!line) {
      throw new NotFoundException({
        message: 'Product not found in the service recipe',
        errorCode: 'SERVICE_PRODUCT_NOT_FOUND',
      });
    }
    return line;
  }

  private handleRecipePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        message: 'Product already exists in the service recipe',
        errorCode: 'SERVICE_PRODUCT_ALREADY_EXISTS',
      });
    }
    throw error;
  }

  private toRecipeResponse(line: {
    id: string;
    serviceId: string;
    productId: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    product: {
      id: string;
      code: string;
      name: string;
      consumptionType: string;
    };
  }): ServiceProductResponseDto {
    return plainToInstance(
      ServiceProductResponseDto,
      {
        ...line,
        product: {
          id: line.product.id,
          code: line.product.code,
          name: line.product.name,
          consumptionType: line.product.consumptionType,
        },
      },
      { excludeExtraneousValues: true }
    );
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException();
    }
    throw error;
  }

  private toResponse(service: Service): ServiceResponseDto {
    return plainToInstance(ServiceResponseDto, service, {
      excludeExtraneousValues: true,
    });
  }
}
