import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiPeruRucProvider } from './apiperu-ruc.provider';
import { FiscalNumberingService } from './fiscal-numbering.service';
import { RUC_LOOKUP_PROVIDER } from './ruc-lookup-provider';
import { SunatBillClient } from './sunat-bill-client';
import { SunatEmissionController } from './sunat-emission.controller';
import { SunatEmissionService } from './sunat-emission.service';
import { SunatController } from './sunat.controller';
import { SunatService } from './sunat.service';

@Module({
  imports: [AuthModule],
  controllers: [SunatController, SunatEmissionController],
  providers: [
    ApiPeruRucProvider,
    { provide: RUC_LOOKUP_PROVIDER, useExisting: ApiPeruRucProvider },
    SunatService,
    FiscalNumberingService,
    SunatBillClient,
    SunatEmissionService,
  ],
  exports: [SunatService, SunatEmissionService],
})
export class SunatModule {}
