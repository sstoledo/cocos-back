import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { ListUbigeosQueryDto } from './dto/list-ubigeos-query.dto';
import {
  UBIGEO_DEFAULT_LIMIT,
  findUbigeo,
  searchUbigeos,
} from './ubigeo.catalog';

const ALL_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Mechanic,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
];

@Controller('ubigeos')
@UseGuards(RolesGuard)
export class UbigeoController {
  @Get()
  @Roles(...ALL_ROLES)
  list(@Query() dto: ListUbigeosQueryDto) {
    return searchUbigeos(dto.query ?? '', dto.limit ?? UBIGEO_DEFAULT_LIMIT);
  }

  @Get(':code')
  @Roles(...ALL_ROLES)
  findOne(@Param('code') code: string) {
    const entry = findUbigeo(code);
    if (!entry) {
      throw new NotFoundException(`Unknown ubigeo code: ${code}`);
    }
    return entry;
  }
}
