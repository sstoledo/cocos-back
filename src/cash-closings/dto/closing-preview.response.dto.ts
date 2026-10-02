import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class ClosingPreviewResponseDto {
  @Expose()
  @Type(() => Date)
  periodStart: Date | null;

  @Expose()
  expectedCash: string;

  @Expose()
  expectedCard: string;

  @Expose()
  expectedTransfer: string;

  @Expose()
  salesCount: number;
}
