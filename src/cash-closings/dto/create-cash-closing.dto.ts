import { IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

export class CreateCashClosingDto {
  // The pattern already rejects negative values; @Min does not apply to
  // string-typed properties (it only validates numbers) — B10 lesson.
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  declaredCash: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
