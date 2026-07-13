import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockService } from './stock.service';

@Controller('stock')
@UseGuards(RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('products/:productId')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  getStockByProduct(@Param('productId') productId: string) {
    return this.stockService.getStockByProduct(productId);
  }

  @Get('products/:productId/movements')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  getMovementsByProduct(@Param('productId') productId: string) {
    return this.stockService.getMovementsByProduct(productId);
  }

  @Post('movements')
  @Roles(RoleName.Admin, RoleName.Warehouse, RoleName.Purchasing)
  createMovement(@Body() dto: CreateStockMovementDto) {
    return this.stockService.adjustStock(dto);
  }
}
