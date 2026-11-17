import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiPeruRucProvider } from './apiperu-ruc.provider';
import { RUC_LOOKUP_PROVIDER } from './ruc-lookup-provider';
import { SunatController } from './sunat.controller';
import { SunatService } from './sunat.service';

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
