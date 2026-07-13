import { Controller, Get, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
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
}
