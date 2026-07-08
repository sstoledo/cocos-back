import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return undefined;
  }

  findOne(id: string) {
    return undefined;
  }

  create(dto: CreateProductDto) {
    return undefined;
  }

  update(id: string, dto: UpdateProductDto) {
    return undefined;
  }

  remove(id: string) {
    return undefined;
  }
}
