import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, specialty: true, userId: true },
      orderBy: { name: 'asc' },
    });
  }
}
