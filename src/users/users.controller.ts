import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { Roles, RolesGuard, auth } from '../auth';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  async getMe(@Req() request: Request) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    return this.usersService.findMe(session.user.id);
  }
}
