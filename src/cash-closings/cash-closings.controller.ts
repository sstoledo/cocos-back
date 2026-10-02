import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { CashClosingsService } from './cash-closings.service';
import { CreateCashClosingDto } from './dto/create-cash-closing.dto';

@Controller('cash-closings')
@UseGuards(RolesGuard)
export class CashClosingsController {
  constructor(private readonly cashClosingsService: CashClosingsService) {}

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  close(@Req() request: RequestWithUser, @Body() dto: CreateCashClosingDto) {
    return this.cashClosingsService.close(request.user.id, dto);
  }

  @Get('preview')
  @Roles(RoleName.Admin, RoleName.Reception)
  preview(@Req() request: RequestWithUser) {
    return this.cashClosingsService.preview(request.user.id);
  }
}
