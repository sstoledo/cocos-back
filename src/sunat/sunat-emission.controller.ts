import { Controller, Post, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { SunatEmissionService } from './sunat-emission.service';

@Controller('sales')
@UseGuards(RolesGuard)
export class SunatEmissionController {
  constructor(private readonly emissionService: SunatEmissionService) {}

  @Post(':id/emit')
  @Roles(RoleName.Admin, RoleName.Reception)
  emit(id: string) {
    return this.emissionService.emit(id);
  }
}
