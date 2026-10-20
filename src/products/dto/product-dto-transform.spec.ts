import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

describe('Product DTOs isActive transform (multipart strings)', () => {
  it.each([
    ['false', false],
    ['true', true],
    [false, false],
    [true, true],
  ])('CreateProductDto maps isActive=%j to %j', (input, expected) => {
    const dto = plainToInstance(CreateProductDto, { isActive: input });
    expect(dto.isActive).toBe(expected);
  });

  it.each([
    ['false', false],
    ['true', true],
  ])('UpdateProductDto maps isActive=%j to %j', (input, expected) => {
    const dto = plainToInstance(UpdateProductDto, { isActive: input });
    expect(dto.isActive).toBe(expected);
  });
});
