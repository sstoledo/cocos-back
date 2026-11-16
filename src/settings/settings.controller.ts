import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('company')
  @Roles(RoleName.Admin)
  getCompanySettings() {
    return this.settingsService.getCompanySettings();
  }

  @Patch('company')
  @Roles(RoleName.Admin)
  updateCompanySettings(@Body() dto: UpdateCompanySettingsDto) {
    return this.settingsService.updateCompanySettings(dto);
  }
}
