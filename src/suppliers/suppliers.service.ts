import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

const activeWhere = { isActive: true };

const softDeleteData = { isActive: false, deletedAt: new Date() };

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(queryDto: ListSuppliersQueryDto) {
    const { page = 1, limit = 10, q, isActive } = queryDto;
    const where: Prisma.SupplierWhereInput = { isActive: true };

    if (q !== undefined) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, ...activeWhere },
    });
    if (!supplier) {
      throw new NotFoundException();
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.ensureActive(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureActive(id);
    return this.prisma.supplier.update({
      where: { id },
      data: softDeleteData,
    });
  }

  private async ensureActive(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, ...activeWhere },
    });
    if (!supplier) {
      throw new NotFoundException();
    }
  }
}
