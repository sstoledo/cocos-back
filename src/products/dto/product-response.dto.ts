import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class ProductResponseDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  description?: string | null;

  @Expose()
  @Transform(({ value }) => String(value))
  price: string;

  @Expose()
  minStock: number;

  @Expose()
  unit?: string | null;

  @Expose()
  imageUrl?: string | null;

  @Expose()
  imagePublicId?: string | null;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
