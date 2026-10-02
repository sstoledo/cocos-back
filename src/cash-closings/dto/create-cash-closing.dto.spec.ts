import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';
import { CreateCashClosingDto } from './create-cash-closing.dto';

const expectErrorsOn = (
  errors: ValidationError[],
  ...properties: string[]
): void => {
  expect(errors).toHaveLength(properties.length);
  for (const property of properties) {
    expect(errors.some((error) => error.property === property)).toBe(true);
  }
};

describe('CreateCashClosingDto', () => {
  it.each([
    ['an integer amount', '0'],
    ['a plain amount', '100'],
    ['one decimal place', '100.5'],
    ['two decimal places', '100.55'],
  ])('passes for %s', async (_label, declaredCash) => {
    const dto = plainToInstance(CreateCashClosingDto, { declaredCash });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes with optional notes', async () => {
    const dto = plainToInstance(CreateCashClosingDto, {
      declaredCash: '10.00',
      notes: 'Cierre sin novedades',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    // @Min does not validate strings (B10 lesson): the regex is what
    // actually rejects negatives, non-numeric input and >2 decimals.
    ['a negative amount', { declaredCash: '-1' }],
    ['a non-numeric amount', { declaredCash: 'abc' }],
    ['more than two decimals', { declaredCash: '10.999' }],
    ['an empty amount', { declaredCash: '' }],
    ['a missing declaredCash', {}],
    ['a numeric declaredCash instead of string', { declaredCash: 10 }],
    ['non-string notes', { declaredCash: '10', notes: 42 }],
  ])('rejects %s', async (_label, payload) => {
    const dto = plainToInstance(CreateCashClosingDto, payload);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reports declaredCash as the failing property for a bad amount', async () => {
    const dto = plainToInstance(CreateCashClosingDto, {
      declaredCash: '10.999',
    });

    expectErrorsOn(await validate(dto), 'declaredCash');
  });
});
