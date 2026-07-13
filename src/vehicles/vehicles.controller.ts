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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll(@Query() queryDto: ListVehiclesQueryDto) {
    return this.vehiclesService.findAll(queryDto);
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
    return this.vehiclesService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
