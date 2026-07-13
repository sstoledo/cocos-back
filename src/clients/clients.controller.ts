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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll(@Query() queryDto: ListClientsQueryDto) {
    return this.clientsService.findAll(queryDto);
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
    return this.clientsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin, RoleName.Reception)
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin, RoleName.Reception)
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
