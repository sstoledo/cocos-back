import { BadRequestException, Injectable } from '@nestjs/common';
import { isValidRuc } from '../clients/validators/identification.validator';
import { PrismaService } from '../prisma/prisma.service';
import { findUbigeo } from '../ubigeo/ubigeo.catalog';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanySettings() {
    return this.getOrCreate();
  }

  async updateCompanySettings(dto: UpdateCompanySettingsDto) {
    if (dto.ruc !== undefined && dto.ruc !== null && !isValidRuc(dto.ruc)) {
      throw new BadRequestException('RUC must be a valid 11-digit RUC');
    }

    for (const series of [dto.facturaSeries, dto.boletaSeries]) {
      if (series !== undefined && series.trim().length === 0) {
        throw new BadRequestException('Series values cannot be empty');
      }
    }

    const ubigeo = dto.ubigeo?.trim();
    if (ubigeo !== undefined && ubigeo !== '' && !findUbigeo(ubigeo)) {
      throw new BadRequestException(
        'ubigeo must be a 6-digit INEI code from the catalog'
      );
    }

    const settings = await this.getOrCreate();

    return this.prisma.companySettings.update({
      where: { id: settings.id },
      data: {
        ...(dto.ruc !== undefined ? { ruc: dto.ruc } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(ubigeo !== undefined ? { ubigeo: ubigeo || null } : {}),
        ...(dto.facturaSeries !== undefined
          ? { facturaSeries: dto.facturaSeries.trim() }
          : {}),
        ...(dto.boletaSeries !== undefined
          ? { boletaSeries: dto.boletaSeries.trim() }
          : {}),
      },
    });
  }

  private async getOrCreate() {
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) {
      return existing;
    }

    return this.prisma.companySettings.create({
      data: {
        facturaSeries: 'F001',
        boletaSeries: 'B001',
      },
    });
  }
}
