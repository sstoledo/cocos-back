import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CashClosingsController } from './cash-closings.controller';
import { CashClosingsService } from './cash-closings.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CashClosingsController],
  providers: [CashClosingsService],
  exports: [CashClosingsService],
})
export class CashClosingsModule {}
