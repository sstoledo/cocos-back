import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';

@Controller('lots')
@UseGuards(RolesGuard)
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll() {
    return this.lotsService.findAll();
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
    return this.lotsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse)
  create(@Body() dto: CreateLotDto) {
    return this.lotsService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse)
  update(@Param('id') id: string, @Body() dto: UpdateLotDto) {
    return this.lotsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Warehouse)
  remove(@Param('id') id: string) {
    return this.lotsService.remove(id);
  }
}
