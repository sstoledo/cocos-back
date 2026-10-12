import { Controller, Get, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(RoleName.Admin, RoleName.Reception)
  findAll() {
    return this.employeesService.findAll();
  }
}
