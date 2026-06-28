import { Module } from '@nestjs/common';
import { RolesGuard } from './role.guard';

@Module({
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class AuthModule {}
