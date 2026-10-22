import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesModule } from '../sales/sales.module';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';

@Module({
  imports: [PrismaModule, SalesModule],
  controllers: [ProformasController],
  providers: [ProformasService],
  exports: [ProformasService],
})
export class ProformasModule {}
