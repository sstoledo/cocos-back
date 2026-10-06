import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Presentation } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePresentationDto } from './dto/create-presentation.dto';
import type { ListPresentationsQueryDto } from './dto/list-presentations-query.dto';
import type { UpdatePresentationDto } from './dto/update-presentation.dto';

@Injectable()
export class PresentationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(queryDto: ListPresentationsQueryDto) {
    const { page = 1, limit = 10, q } = queryDto;
    const where: Prisma.PresentationWhereInput = {};

    if (q !== undefined) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.presentation.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.presentation.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id },
    });
    if (!presentation) {
      throw new NotFoundException();
    }
    return presentation;
  }

  async create(dto: CreatePresentationDto) {
    try {
      return await this.prisma.presentation.create({ data: dto });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdatePresentationDto) {
    await this.findOne(id);

    try {
      return await this.prisma.presentation.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.presentation.delete({
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
