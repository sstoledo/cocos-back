import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';

function normalizePlate(plate: string): string {
  return plate.toUpperCase().trim().replace(/[-\s]/g, '');
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService
  ) {}

  async create(dto: CreateVehicleDto) {
    await this.ensureClientExists(dto.clientId);

    const data = { ...dto, plate: normalizePlate(dto.plate) };

    try {
      return await this.prisma.vehicle.create({ data });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(queryDto: ListVehiclesQueryDto) {
    const { clientId, page = 1, limit = 10 } = queryDto;
    const where: Prisma.VehicleWhereInput = { isActive: true };

    if (clientId) {
      where.clientId = clientId;
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, isActive: true },
    });
    if (!vehicle) {
      throw new NotFoundException();
    }
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);

    if (dto.clientId) {
      await this.ensureClientExists(dto.clientId);
    }

    const data = { ...dto };
    if (data.plate) {
      data.plate = normalizePlate(data.plate);
    }

    try {
      return await this.prisma.vehicle.update({ where: { id }, data });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const exists = await this.clientsService.exists(clientId);
    if (!exists) {
      throw new NotFoundException();
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.vehicle.update({
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
