import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Brand } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBrandDto } from './dto/create-brand.dto';
import type { UpdateBrandDto } from './dto/update-brand.dto';
import type { ListBrandsQueryDto } from './dto/list-brands-query.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(queryDto: ListBrandsQueryDto) {
    const { page = 1, limit = 10, q } = queryDto;
    const where: Prisma.BrandWhereInput = {};

    if (q !== undefined) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.brand.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
    });
    if (!brand) {
      throw new NotFoundException();
    }
    return brand;
  }

  async create(dto: CreateBrandDto) {
    try {
      return await this.prisma.brand.create({ data: dto });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.findOne(id);

    try {
      return await this.prisma.brand.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.brand.delete({
      where: { id },
    });
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
}
