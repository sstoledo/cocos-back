import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListSemanticProductsQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true
  )
  @IsBoolean()
  isActive?: boolean = true;
}
