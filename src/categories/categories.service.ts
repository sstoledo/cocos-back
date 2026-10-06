import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(queryDto: ListCategoriesQueryDto) {
    const { page = 1, limit = 10, q } = queryDto;
    const where: Prisma.CategoryWhereInput = {};

    if (q !== undefined) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { parent: true },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true },
    });
    if (!category) {
      throw new NotFoundException();
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: dto,
        include: { parent: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
        include: { parent: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.category.delete({
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
