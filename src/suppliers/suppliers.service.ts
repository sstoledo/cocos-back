import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';

const activeWhere = { isActive: true };

const softDeleteData = { isActive: false, deletedAt: new Date() };

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.supplier.findMany({
      where: activeWhere,
      orderBy: { name: 'asc' },
    });
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
