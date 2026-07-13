import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PresentationsController } from './presentations.controller';
import { PresentationsService } from './presentations.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
