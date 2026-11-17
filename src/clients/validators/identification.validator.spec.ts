import type { ValidationArguments } from 'class-validator';
import { IsValidIdentification } from './identification.validator';

const validator = new IsValidIdentification();

function validate(value: {
  identification?: string;
  identificationType?: string;
}): boolean {
  return validator.validate(undefined, {
    object: value,
  } as unknown as ValidationArguments);
}

describe('IsValidIdentification', () => {
  describe('DNI', () => {
    it('accepts an 8-digit DNI', () => {
      expect(
        validate({ identification: '12345678', identificationType: 'DNI' })
      ).toBe(true);
    });

    it('rejects a DNI with fewer or more than 8 digits', () => {
      expect(
        validate({ identification: '1234567', identificationType: 'DNI' })
      ).toBe(false);
      expect(
        validate({ identification: '123456789', identificationType: 'DNI' })
      ).toBe(false);
    });
  });

  describe('RUC', () => {
    it('accepts an 11-digit RUC with a valid check digit', () => {
      expect(
        validate({ identification: '20100070970', identificationType: 'RUC' })
      ).toBe(true);
      expect(
        validate({ identification: '10456789019', identificationType: 'RUC' })
      ).toBe(true);
    });

    it('rejects an 11-digit RUC whose check digit is invalid', () => {
      expect(
        validate({ identification: '20100070971', identificationType: 'RUC' })
      ).toBe(false);
      expect(
        validate({ identification: '12345678901', identificationType: 'RUC' })
      ).toBe(false);
    });

    it('rejects an 11-digit RUC with an invalid prefix', () => {
      expect(
        validate({ identification: '99123456789', identificationType: 'RUC' })
      ).toBe(false);
    });

    it('rejects an 11-digit RUC with non-digit characters', () => {
      expect(
        validate({ identification: '2010007097a', identificationType: 'RUC' })
      ).toBe(false);
    });
  });

  describe('optional values', () => {
    it('accepts when both identification and identificationType are absent', () => {
      expect(validate({})).toBe(true);
    });

    it('rejects when only one of the two is provided', () => {
      expect(validate({ identification: '12345678' })).toBe(false);
      expect(validate({ identificationType: 'DNI' })).toBe(false);
    });
  });

  describe('unknown type', () => {
    it('rejects an unsupported identification type', () => {
      expect(
        validate({ identification: '12345678', identificationType: 'PASSPORT' })
      ).toBe(false);
    });
  });
});
