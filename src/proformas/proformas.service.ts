import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProformaStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProformaDto } from './dto/create-proforma.dto';
import type { ListProformasQueryDto } from './dto/list-proformas-query.dto';
import { ProformaResponseDto } from './dto/proforma-response.dto';
import type { UpdateProformaStatusDto } from './dto/update-proforma-status.dto';
import type { UpdateProformaDto } from './dto/update-proforma.dto';

const PROFORMA_INCLUDE = {
  client: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  products: { include: { product: true } },
} as const;

// Allowed transitions. `converted` is only reachable through the
// convert-to-sale flow, never through this map.
const ALLOWED_TRANSITIONS: Record<ProformaStatus, ProformaStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
  converted: [],
};

type ResolvedLineItem = {
  productId: string;
  quantity: number;
  unitPriceSnapshot: Prisma.Decimal;
  subtotal: Prisma.Decimal;
};

@Injectable()
export class ProformasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProformaDto) {
    const productLines = dto.productLines ?? [];
    this.ensureLinesValid(productLines);

    await this.ensureClientExists(dto.clientId);
    await this.ensureBranchExists(dto.branchId);
    await this.ensureEmployeeExists(dto.employeeId);

    const lineItems = await this.resolveProductLineItems(productLines);
    const totalAmount = this.computeTotal(lineItems);

    return this.prisma.$transaction(async (tx) => {
      const proformaNumber = await this.generateProformaNumber(tx);

      const proforma = await tx.proforma.create({
        data: {
          proformaNumber,
          clientId: dto.clientId ?? null,
          branchId: dto.branchId ?? null,
          employeeId: dto.employeeId ?? null,
          notes: dto.notes ?? null,
          status: 'draft',
          totalAmount,
          products: {
            create: lineItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: item.unitPriceSnapshot,
              subtotal: item.subtotal,
            })),
          },
        },
        include: PROFORMA_INCLUDE,
      });

      // No stock operations: a proforma only becomes a stock movement when it
      // is converted into a sale.
      return this.toResponse(proforma);
    });
  }

  async update(id: string, dto: UpdateProformaDto) {
    const existing = await this.prisma.proforma.findUnique({
      where: { id, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException({
        message: 'Proforma not found',
        errorCode: 'PROFORMA_NOT_FOUND',
      });
    }

    if (existing.status !== 'draft') {
      throw new ConflictException({
        message: 'Only draft proformas can be edited',
        errorCode: 'PROFORMA_NOT_DRAFT',
      });
    }

    await this.ensureClientExists(dto.clientId);
    await this.ensureBranchExists(dto.branchId);
    await this.ensureEmployeeExists(dto.employeeId);

    let lineItems: ResolvedLineItem[] | undefined;
    if (dto.productLines !== undefined) {
      this.ensureLinesValid(dto.productLines);
      lineItems = await this.resolveProductLineItems(dto.productLines);
    }

    return this.prisma.$transaction(async (tx) => {
      if (lineItems !== undefined) {
        await tx.proformaProduct.deleteMany({ where: { proformaId: id } });
      }

      const proforma = await tx.proforma.update({
        where: { id },
        data: {
          clientId: dto.clientId,
          branchId: dto.branchId,
          employeeId: dto.employeeId,
          notes: dto.notes,
          ...(lineItems !== undefined
            ? {
                totalAmount: this.computeTotal(lineItems),
                products: {
                  create: lineItems.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPriceSnapshot: item.unitPriceSnapshot,
                    subtotal: item.subtotal,
                  })),
                },
              }
            : {}),
        },
        include: PROFORMA_INCLUDE,
      });

      return this.toResponse(proforma);
    });
  }

  async updateStatus(id: string, dto: UpdateProformaStatusDto) {
    const existing = await this.prisma.proforma.findUnique({
      where: { id, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException({
        message: 'Proforma not found',
        errorCode: 'PROFORMA_NOT_FOUND',
      });
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException({
        message: `Cannot transition proforma from ${existing.status} to ${dto.status}`,
        errorCode: 'INVALID_STATUS_TRANSITION',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Flip-first guard: a concurrent transition loses here (count === 0).
      const guard = await tx.proforma.updateMany({
        where: { id, status: existing.status },
        data: { status: dto.status },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message: `Cannot transition proforma from ${existing.status} to ${dto.status}`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
      }

      const refreshed = await tx.proforma.findUnique({
        where: { id, isActive: true },
        include: PROFORMA_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Proforma not found',
          errorCode: 'PROFORMA_NOT_FOUND',
        });
      }

      return this.toResponse(refreshed);
    });
  }

  async findAll(queryDto: ListProformasQueryDto) {
    const {
      page = 1,
      limit = 10,
      from,
      to,
      clientId,
      status,
      proformaNumber,
    } = queryDto;
    const where: Prisma.ProformaWhereInput = { isActive: true };

    if (from !== undefined || to !== undefined) {
      where.createdAt = {};
      if (from !== undefined) {
        where.createdAt.gte = new Date(from);
      }
      if (to !== undefined) {
        where.createdAt.lte = new Date(to);
      }
    }
    if (clientId !== undefined) {
      where.clientId = clientId;
    }
    if (status !== undefined) {
      where.status = status;
    }
    if (proformaNumber !== undefined) {
      where.proformaNumber = { contains: proformaNumber, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.proforma.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: PROFORMA_INCLUDE,
      }),
      this.prisma.proforma.count({ where }),
    ]);

    return {
      data: data.map((proforma) => this.toResponse(proforma)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const proforma = await this.prisma.proforma.findUnique({
      where: { id, isActive: true },
      include: PROFORMA_INCLUDE,
    });
    if (!proforma) {
      throw new NotFoundException({
        message: 'Proforma not found',
        errorCode: 'PROFORMA_NOT_FOUND',
      });
    }
    return this.toResponse(proforma);
  }

  private ensureLinesValid(
    lines: Array<{ productId: string; quantity: number }>
  ): void {
    if (lines.length === 0) {
      throw new BadRequestException({
        message: 'Proforma must include at least one product line',
        errorCode: 'PROFORMA_EMPTY_LINES',
      });
    }

    const ids = lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        message: 'Duplicate productId entries are not allowed in a proforma',
        errorCode: 'PROFORMA_DUPLICATE_LINE',
      });
    }
  }

  private async ensureClientExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const client = await this.prisma.client.findUnique({
      where: { id, isActive: true },
    });
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found or inactive',
        errorCode: 'CLIENT_NOT_FOUND',
      });
    }
  }

  private async ensureBranchExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({
        message: 'Branch not found or inactive',
        errorCode: 'BRANCH_NOT_FOUND',
      });
    }
  }

  private async ensureEmployeeExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id, isActive: true },
    });
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found or inactive',
        errorCode: 'EMPLOYEE_NOT_FOUND',
      });
    }
  }

  private async resolveProductLineItems(
    lines: Array<{ productId: string; quantity: number }>
  ): Promise<ResolvedLineItem[]> {
    const lineItems: ResolvedLineItem[] = [];

    for (const line of lines) {
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId, isActive: true },
      });

      if (!product) {
        throw new NotFoundException({
          message: 'Product not found or inactive',
          errorCode: 'PRODUCT_NOT_FOUND',
        });
      }

      // Client-sent prices are ignored: snapshot from the catalog price.
      const unitPriceSnapshot = new Prisma.Decimal(product.price);
      lineItems.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceSnapshot,
        subtotal: unitPriceSnapshot.mul(line.quantity),
      });
    }

    return lineItems;
  }

  private computeTotal(lineItems: ResolvedLineItem[]): Prisma.Decimal {
    return lineItems.reduce(
      (total, line) => total.add(line.subtotal),
      new Prisma.Decimal(0)
    );
  }

  private async generateProformaNumber(
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const currentYear = new Date().getFullYear();

    const sequence = await tx.proformaNumberSequence.upsert({
      where: { year: currentYear },
      create: { year: currentYear, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return `PRO-${currentYear}-${sequence.lastNumber.toString().padStart(6, '0')}`;
  }

  private toResponse(proforma: {
    id: string;
    proformaNumber: string;
    clientId: string | null;
    branchId: string | null;
    employeeId: string | null;
    status: string;
    totalAmount: Prisma.Decimal;
    notes: string | null;
    convertedSaleId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    client?: { id: string; name: string } | null;
    branch?: { id: string; name: string } | null;
    employee?: { id: string; name: string } | null;
    products?: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
      product: {
        id: string;
        code: string;
        name: string;
        description: string | null;
        price: Prisma.Decimal;
      };
    }>;
  }): ProformaResponseDto {
    const products = proforma.products?.map((p) => ({
      id: p.id,
      productId: p.productId,
      quantity: p.quantity,
      unitPriceSnapshot: Number(p.unitPriceSnapshot).toFixed(2),
      subtotal: Number(p.subtotal).toFixed(2),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      product: {
        id: p.product.id,
        code: p.product.code,
        name: p.product.name,
        description: p.product.description,
        price: Number(p.product.price).toFixed(2),
      },
    }));

    return plainToInstance(
      ProformaResponseDto,
      {
        ...proforma,
        totalAmount: Number(proforma.totalAmount).toFixed(2),
        client: proforma.client
          ? { id: proforma.client.id, name: proforma.client.name }
          : null,
        branch: proforma.branch
          ? { id: proforma.branch.id, name: proforma.branch.name }
          : null,
        employee: proforma.employee
          ? { id: proforma.employee.id, name: proforma.employee.name }
          : null,
        products: products ?? [],
      },
      { excludeExtraneousValues: true }
    );
  }
}
