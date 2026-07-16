import 'reflect-metadata';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';
import { ListServicesQueryDto } from './list-services-query.dto';
import { ServiceResponseDto } from './service-response.dto';
import { UpdateServiceDto } from './update-service.dto';

const expectErrorsOn = (
  errors: ValidationError[],
  ...properties: string[]
): void => {
  expect(errors).toHaveLength(properties.length);
  for (const property of properties) {
    expect(errors.some((error) => error.property === property)).toBe(true);
  }
};

describe('Service DTOs', () => {
  describe('CreateServiceDto', () => {
    it('passes for a valid service with all optional fields', async () => {
      const dto = new CreateServiceDto();
      dto.code = 'OIL-001';
      dto.name = 'Oil change';
      dto.description = 'Standard oil change';
      dto.price = 25.5;
      dto.estimatedDuration = 30;

      expect(await validate(dto)).toHaveLength(0);
    });

    it('passes with only required fields', async () => {
      const dto = new CreateServiceDto();
      dto.code = 'TIRE-001';
      dto.name = 'Tire rotation';
      dto.price = 15;

      expect(await validate(dto)).toHaveLength(0);
    });

    it.each([
      ['code is missing', { name: 'Oil change', price: 25 }, ['code']],
      ['code is empty', { code: '', name: 'Oil change', price: 25 }, ['code']],
      [
        'code is too long',
        { code: 'a'.repeat(51), name: 'Oil change', price: 25 },
        ['code'],
      ],
      ['name is missing', { code: 'OIL-001', price: 25 }, ['name']],
      ['name is empty', { code: 'OIL-001', name: '', price: 25 }, ['name']],
      [
        'name is too long',
        { code: 'OIL-001', name: 'a'.repeat(201), price: 25 },
        ['name'],
      ],
      [
        'description is too long',
        {
          code: 'OIL-001',
          name: 'Oil change',
          description: 'a'.repeat(2001),
          price: 25,
        },
        ['description'],
      ],
      [
        'price is zero',
        { code: 'OIL-001', name: 'Oil change', price: 0 },
        ['price'],
      ],
      [
        'price is negative',
        { code: 'OIL-001', name: 'Oil change', price: -1 },
        ['price'],
      ],
      [
        'price has too many decimals',
        { code: 'OIL-001', name: 'Oil change', price: 25.555 },
        ['price'],
      ],
      [
        'estimatedDuration is zero',
        {
          code: 'OIL-001',
          name: 'Oil change',
          price: 25,
          estimatedDuration: 0,
        },
        ['estimatedDuration'],
      ],
      [
        'estimatedDuration is negative',
        {
          code: 'OIL-001',
          name: 'Oil change',
          price: 25,
          estimatedDuration: -5,
        },
        ['estimatedDuration'],
      ],
      [
        'estimatedDuration is not an integer',
        {
          code: 'OIL-001',
          name: 'Oil change',
          price: 25,
          estimatedDuration: 30.5,
        },
        ['estimatedDuration'],
      ],
    ])('fails when %s', async (_, partial, properties) => {
      const dto = new CreateServiceDto();
      Object.assign(dto, partial);

      expectErrorsOn(await validate(dto), ...properties);
    });
  });

  describe('UpdateServiceDto', () => {
    it('passes with no fields', async () => {
      expect(await validate(new UpdateServiceDto())).toHaveLength(0);
    });

    it('passes with valid optional fields', async () => {
      const dto = new UpdateServiceDto();
      dto.name = 'Premium oil change';
      dto.price = 35;
      dto.estimatedDuration = 45;

      expect(await validate(dto)).toHaveLength(0);
    });

    it.each([
      ['code is empty', { code: '' }, ['code']],
      ['price is zero', { price: 0 }, ['price']],
      [
        'estimatedDuration is zero',
        { estimatedDuration: 0 },
        ['estimatedDuration'],
      ],
    ])('fails when %s', async (_, partial, properties) => {
      const dto = new UpdateServiceDto();
      Object.assign(dto, partial);

      expectErrorsOn(await validate(dto), ...properties);
    });
  });

  describe('ListServicesQueryDto', () => {
    it('applies default pagination values', () => {
      const dto = plainToInstance(ListServicesQueryDto, {});

      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(10);
    });

    it.each([
      ['page', { page: 0 }],
      ['limit', { limit: 0 }],
      ['query', { query: 'a'.repeat(101) }],
    ])('fails when %s is invalid', async (property, query) => {
      const dto = plainToInstance(ListServicesQueryDto, query);

      expectErrorsOn(await validate(dto), property);
    });

    it('passes with custom page and limit', async () => {
      const dto = plainToInstance(ListServicesQueryDto, { page: 2, limit: 25 });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(25);
    });
  });

  describe('ServiceResponseDto', () => {
    it('serializes price as a string and exposes all expected fields', () => {
      const plain = {
        id: 'svc-1',
        code: 'OIL-001',
        name: 'Oil change',
        description: null,
        price: 25.5,
        estimatedDuration: null,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
      };
      const dto = plainToInstance(ServiceResponseDto, plain);
      const serialized = instanceToPlain(dto, {
        excludeExtraneousValues: true,
      });

      expect(serialized).toMatchObject({
        id: 'svc-1',
        code: 'OIL-001',
        name: 'Oil change',
        description: null,
        price: '25.5',
        estimatedDuration: null,
        isActive: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        deletedAt: null,
      });
    });
  });
});
