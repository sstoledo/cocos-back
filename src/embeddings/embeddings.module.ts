import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [ConfigModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
