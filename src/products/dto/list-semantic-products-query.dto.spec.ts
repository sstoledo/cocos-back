import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListSemanticProductsQueryDto } from './list-semantic-products-query.dto';

describe('ListSemanticProductsQueryDto', () => {
  it('trims q and applies default limit and active filter', async () => {
    const dto = plainToInstance(ListSemanticProductsQueryDto, {
      q: '  pico y espiga  ',
    });

    expect(dto.q).toBe('pico y espiga');
    expect(dto.limit).toBe(10);
    expect(dto.isActive).toBe(true);
    expect(await validate(dto)).toEqual([]);
  });

  it('preserves an explicitly requested false isActive filter', () => {
    const dto = plainToInstance(ListSemanticProductsQueryDto, {
      q: 'brake pads',
      isActive: 'false',
      limit: '20',
    });

    expect(dto.isActive).toBe(false);
    expect(dto.limit).toBe(20);
  });

  it.each([{ q: ' a ' }, { q: 'valid', limit: 0 }, { q: 'valid', limit: 21 }])(
    'rejects invalid semantic query params: %j',
    async (input) => {
      const dto = plainToInstance(ListSemanticProductsQueryDto, input);
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  );
});
