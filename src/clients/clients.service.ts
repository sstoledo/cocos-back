import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { ListClientsQueryDto } from './dto/list-clients-query.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    try {
      return await this.prisma.client.create({ data: dto });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(queryDto: ListClientsQueryDto) {
    const { query, page = 1, limit = 10 } = queryDto;
    const where: Prisma.ClientWhereInput = { isActive: true };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { identification: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id, isActive: true },
      include: { vehicles: { where: { isActive: true } } },
    });
    if (!client) {
      throw new NotFoundException();
    }
    return client;
  }

  async exists(id: string): Promise<boolean> {
    const client = await this.prisma.client.findUnique({
      where: { id, isActive: true },
      select: { id: true },
    });
    return client !== null;
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);

    try {
      return await this.prisma.client.update({ where: { id }, data: dto });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
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
