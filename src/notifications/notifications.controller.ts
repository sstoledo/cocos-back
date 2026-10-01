import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

const ALL_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Mechanic,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
] as const;

@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  findAll(
    @Req() request: RequestWithUser,
    @Query() queryDto: ListNotificationsQueryDto
  ) {
    return this.notificationsService.findAllForUser(request.user.id, queryDto);
  }

  @Patch('read-all')
  @Roles(...ALL_ROLES)
  markAllRead(@Req() request: RequestWithUser) {
    return this.notificationsService.markAllRead(request.user.id);
  }

  @Patch(':id/read')
  @Roles(...ALL_ROLES)
  markRead(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.notificationsService.markRead(request.user.id, id);
  }
}
