import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll(@Query() queryDto: ListBrandsQueryDto) {
    return this.brandsService.findAll(queryDto);
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
    return this.brandsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin)
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin)
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin)
  remove(@Param('id') id: string) {
    return this.brandsService.remove(id);
  }
}
