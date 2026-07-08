import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ProductsService } from './products.service';
import type { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Warehouse, RoleName.Purchasing)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Warehouse, RoleName.Purchasing)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Warehouse)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
