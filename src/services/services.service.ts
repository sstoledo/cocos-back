import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Service } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { ListServicesQueryDto } from './dto/list-services-query.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
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
