import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { Roles, RolesGuard } from '../auth';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
  async findMe(@Req() request: RequestWithUser) {
    return this.usersService.findMe(request.user.id);
  }

  @Get()
  @Roles(RoleName.Admin)
  async findAll(@Query() queryDto: ListUsersQueryDto) {
    return this.usersService.findAll(queryDto);
  }

  @Get(':id')
  @Roles(RoleName.Admin)
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.Admin)
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.Admin)
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Patch(':id/role')
  @Roles(RoleName.Admin)
  async assignRole(@Param('id') id: string, @Body() dto: { roleId: string }) {
    return this.usersService.assignRole(id, dto.roleId);
  }
}
