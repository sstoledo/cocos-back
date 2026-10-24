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
import { ConvertProformaDto } from './dto/convert-proforma.dto';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { ListProformasQueryDto } from './dto/list-proformas-query.dto';
import { UpdateProformaStatusDto } from './dto/update-proforma-status.dto';
import { UpdateProformaDto } from './dto/update-proforma.dto';
import { ProformasService } from './proformas.service';

@Controller('proformas')
@UseGuards(RolesGuard)
export class ProformasController {
  constructor(private readonly proformasService: ProformasService) {}

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateProformaDto) {
    return this.proformasService.create(dto);
  }

  @Get()
  @Roles(RoleName.Admin, RoleName.Reception)
  findAll(@Query() queryDto: ListProformasQueryDto) {
    return this.proformasService.findAll(queryDto);
  }

  @Get(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  findOne(@Param('id') id: string) {
    return this.proformasService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  update(@Param('id') id: string, @Body() dto: UpdateProformaDto) {
    return this.proformasService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(RoleName.Admin, RoleName.Reception)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProformaStatusDto) {
    return this.proformasService.updateStatus(id, dto);
  }

  @Post(':id/convert-to-sale')
  @Roles(RoleName.Admin, RoleName.Reception)
  convertToSale(@Param('id') id: string, @Body() dto: ConvertProformaDto) {
    return this.proformasService.convertToSale(id, dto);
  }
}
