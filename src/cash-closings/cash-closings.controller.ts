import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { CashClosingsService } from './cash-closings.service';
import { CreateCashClosingDto } from './dto/create-cash-closing.dto';
import { ListCashClosingsQueryDto } from './dto/list-cash-closings-query.dto';

@Controller('cash-closings')
@UseGuards(RolesGuard)
export class CashClosingsController {
  constructor(private readonly cashClosingsService: CashClosingsService) {}

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  close(@Req() request: RequestWithUser, @Body() dto: CreateCashClosingDto) {
    return this.cashClosingsService.close(request.user.id, dto);
  }

  @Get()
  @Roles(RoleName.Admin, RoleName.Reception)
  findAll(@Query() queryDto: ListCashClosingsQueryDto) {
    return this.cashClosingsService.findAll(queryDto);
  }

  // Literal route must precede ':id' or Express would swallow it as a param.
  @Get('preview')
  @Roles(RoleName.Admin, RoleName.Reception)
  preview(@Req() request: RequestWithUser) {
    return this.cashClosingsService.preview(request.user.id);
  }

  @Get(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  findOne(@Param('id') id: string) {
    return this.cashClosingsService.findOne(id);
  }
}
