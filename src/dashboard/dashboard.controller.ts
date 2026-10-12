import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { DashboardService } from './dashboard.service';

const DASHBOARD_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
] as const;

@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles(...DASHBOARD_ROLES)
  summary(@Req() request: RequestWithUser) {
    return this.dashboardService.summary(request.user.id);
  }
}
