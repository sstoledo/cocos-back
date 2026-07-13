import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresentationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.presentation.findMany({ orderBy: { name: 'asc' } });
  }
}
