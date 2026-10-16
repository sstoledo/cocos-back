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
import { CreateServiceProductDto } from './dto/create-service-product.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { UpdateServiceProductDto } from './dto/update-service-product.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(RolesGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll(@Query() queryDto: ListServicesQueryDto) {
    return this.servicesService.findAll(queryDto);
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
    return this.servicesService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Get(':id/products')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  listRecipe(@Param('id') id: string) {
    return this.servicesService.listRecipe(id);
  }

  @Post(':id/products')
  @Roles(RoleName.Admin, RoleName.Reception)
  addRecipeLine(@Param('id') id: string, @Body() dto: CreateServiceProductDto) {
    return this.servicesService.addRecipeLine(id, dto);
  }

  @Patch(':id/products/:productId')
  @Roles(RoleName.Admin, RoleName.Reception)
  updateRecipeLine(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateServiceProductDto
  ) {
    return this.servicesService.updateRecipeLine(id, productId, dto);
  }

  @Delete(':id/products/:productId')
  @Roles(RoleName.Admin, RoleName.Reception)
  removeRecipeLine(
    @Param('id') id: string,
    @Param('productId') productId: string
  ) {
    return this.servicesService.removeRecipeLine(id, productId);
  }
}
