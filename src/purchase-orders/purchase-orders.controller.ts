import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
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

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Purchasing)
  updateDraft(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrdersService.updateDraft(id, dto);
  }

  @Patch(':id/order')
  @Roles(RoleName.Admin, RoleName.Purchasing)
  order(@Param('id') id: string) {
    return this.purchaseOrdersService.order(id);
  }

  @Patch(':id/cancel')
  @Roles(RoleName.Admin, RoleName.Purchasing)
  cancel(@Param('id') id: string) {
    return this.purchaseOrdersService.cancel(id);
  }

  @Post(':id/receive')
  @Roles(RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse)
  receive(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.purchaseOrdersService.receive(id, dto);
  }
}
