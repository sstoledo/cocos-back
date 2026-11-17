import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { isValidRuc } from '../clients/validators/identification.validator';
import { SunatService } from './sunat.service';

@Controller('sunat')
@UseGuards(RolesGuard)
export class SunatController {
  constructor(private readonly sunatService: SunatService) {}

  @Get('ruc/:ruc')
  @Roles(RoleName.Admin, RoleName.Reception)
  lookupRuc(@Param('ruc') ruc: string) {
    if (!isValidRuc(ruc)) {
      // Rejected locally so an invalid RUC never costs a provider query.
      throw new BadRequestException('El RUC es incorrecto');
    }

    return this.sunatService.lookupRuc(ruc);
  }
}
