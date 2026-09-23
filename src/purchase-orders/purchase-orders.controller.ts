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
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(RolesGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @Roles(RoleName.Admin, RoleName.Purchasing)
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Get()
  @Roles(RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse)
  findAll(@Query() queryDto: ListPurchaseOrdersQueryDto) {
    return this.purchaseOrdersService.findAll(queryDto);
  }

  @Get(':id')
  @Roles(RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse)
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id);
  }
}
