import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ReindexEmbeddingsResponseDto {
  @Expose()
  updated: number;

  @Expose()
  failed: number;

  @Expose()
  totalMissing: number;
}
