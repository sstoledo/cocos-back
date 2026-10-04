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
import { CreatePresentationDto } from './dto/create-presentation.dto';
import { UpdatePresentationDto } from './dto/update-presentation.dto';
import { PresentationsService } from './presentations.service';

@Controller('presentations')
@UseGuards(RolesGuard)
export class PresentationsController {
  constructor(private readonly presentationsService: PresentationsService) {}

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
    return this.presentationsService.findAll();
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
    return this.presentationsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin)
  create(@Body() dto: CreatePresentationDto) {
    return this.presentationsService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin)
  update(@Param('id') id: string, @Body() dto: UpdatePresentationDto) {
    return this.presentationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin)
  remove(@Param('id') id: string) {
    return this.presentationsService.remove(id);
  }
}
