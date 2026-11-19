import { Module } from '@nestjs/common';
import { UbigeoController } from './ubigeo.controller';

@Module({
  controllers: [UbigeoController],
})
export class UbigeoModule {}
