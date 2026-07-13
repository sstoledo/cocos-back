import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLotDto } from './dto/create-lot.dto';
import type { UpdateLotDto } from './dto/update-lot.dto';

const lotInclude = {
  supplier: true,
  items: { include: { product: true } },
};

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.lot.findMany({
      orderBy: { receivedAt: 'desc' },
      include: lotInclude,
    });
  }

  async findOne(id: string) {
    return this.prisma.lot.findUnique({
      where: { id },
      include: lotInclude,
    });
  }

  async create(dto: CreateLotDto) {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({
        data: {
          lotNumber: dto.lotNumber,
          supplierId: dto.supplierId,
          receivedAt: dto.receivedAt,
          notes: dto.notes,
        },
      });

      await tx.lotItem.createMany({
        data: dto.items.map((item) => ({
          lotId: lot.id,
          productId: item.productId,
          quantity: item.quantity,
          remainingQuantity: item.quantity,
          costPrice: item.costPrice,
          expirationDate: item.expirationDate,
        })),
      });

      return tx.lot.findUnique({
        where: { id: lot.id },
        include: lotInclude,
      });
    });
  }

  async update(id: string, dto: UpdateLotDto) {
    await this.ensureExists(id);

    if (!dto.items) {
      return this.prisma.lot.update({
        where: { id },
        data: this.buildUpdateData(dto),
        include: lotInclude,
      });
    }

    const items = dto.items;

    return this.prisma.$transaction(async (tx) => {
      await tx.lotItem.deleteMany({ where: { lotId: id } });

      return tx.lot.update({
        where: { id },
        data: {
          ...this.buildUpdateData(dto),
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              remainingQuantity: item.quantity,
              costPrice: item.costPrice,
              expirationDate: item.expirationDate,
            })),
          },
        },
        include: lotInclude,
      });
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.lot.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const lot = await this.prisma.lot.findUnique({ where: { id } });
    if (!lot) {
      throw new NotFoundException();
    }
  }

  private buildUpdateData(dto: UpdateLotDto) {
    const data: {
      lotNumber?: string;
      supplierId?: string;
      receivedAt?: Date;
      notes?: string;
    } = {};

    if (dto.lotNumber !== undefined) {
      data.lotNumber = dto.lotNumber;
    }
    if (dto.supplierId !== undefined) {
      data.supplierId = dto.supplierId;
    }
    if (dto.receivedAt !== undefined) {
      data.receivedAt = dto.receivedAt;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    return data;
  }
}
