import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from './role.guard';

@Module({
  imports: [PrismaModule],
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class AuthModule {}
