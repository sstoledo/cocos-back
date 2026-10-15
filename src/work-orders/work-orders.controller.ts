import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { CreateWorkOrderPaymentDto } from './dto/create-work-order-payment.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto';
import { TransitionWorkOrderStatusDto } from './dto/transition-work-order-status.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
@UseGuards(RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll(
    @Query() queryDto: ListWorkOrdersQueryDto,
    @Req() request: RequestWithUser
  ) {
    return this.workOrdersService.findAll(queryDto, request.user);
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
  findOne(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.workOrdersService.findOne(id, request.user);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(RoleName.Admin, RoleName.Reception, RoleName.Mechanic)
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionWorkOrderStatusDto,
    @Req() request: RequestWithUser
  ) {
    return this.workOrdersService.transitionStatus(
      id,
      dto.status,
      request.user
    );
  }

  @Get(':id/payments')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  listPayments(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.workOrdersService.listPayments(id, request.user);
  }

  @Post(':id/payments')
  @Roles(RoleName.Admin, RoleName.Reception)
  addPayment(@Param('id') id: string, @Body() dto: CreateWorkOrderPaymentDto) {
    return this.workOrdersService.addPayment(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  remove(@Param('id') id: string) {
    return this.workOrdersService.remove(id);
  }
}
