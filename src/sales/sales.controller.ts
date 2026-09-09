import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }

  @Get()
  @Roles(RoleName.Admin, RoleName.Reception)
  findAll(@Query() queryDto: ListSalesQueryDto) {
    return this.salesService.findAll(queryDto);
  }

  @Get(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }
}
