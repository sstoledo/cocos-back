import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class ClosedBySummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class CashClosingResponseDto {
  @Expose()
  id: string;

  @Expose()
  @Type(() => Date)
  periodStart: Date;

  @Expose()
  @Type(() => Date)
  periodEnd: Date;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  expectedCash: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  expectedCard: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  expectedTransfer: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  declaredCash: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  difference: string;

  @Expose()
  salesCount: number;

  @Expose()
  notes: string | null;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => ClosedBySummaryDto)
  closedBy: ClosedBySummaryDto;
}
