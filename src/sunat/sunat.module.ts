import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiPeruRucProvider } from './apiperu-ruc.provider';
import { SunatController } from './sunat.controller';
import { SunatService } from './sunat.service';

export const RUC_LOOKUP_PROVIDER = 'RucLookupProvider';

@Module({
  imports: [AuthModule],
  controllers: [SunatController],
  providers: [
    ApiPeruRucProvider,
    { provide: RUC_LOOKUP_PROVIDER, useExisting: ApiPeruRucProvider },
    SunatService,
  ],
  exports: [SunatService],
})
export class SunatModule {}
