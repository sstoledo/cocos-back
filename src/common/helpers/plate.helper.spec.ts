import { isValidPlate, normalizePlate } from './plate.helper';

describe('normalizePlate', () => {
  it('uppercases lowercase letters', () => {
    expect(normalizePlate('abc123')).toBe('ABC123');
  });

  it('removes spaces', () => {
    expect(normalizePlate('ABC 123')).toBe('ABC123');
  });

  it('removes hyphens', () => {
    expect(normalizePlate('ABC-123')).toBe('ABC123');
  });

  it('trims whitespace', () => {
    expect(normalizePlate('  ABC123  ')).toBe('ABC123');
  });

  it('removes mixed separators and lowercases', () => {
    expect(normalizePlate(' a-b c-123 ')).toBe('ABC123');
  });
});

describe('isValidPlate', () => {
  it('accepts classic car plates', () => {
    expect(isValidPlate('ABC123')).toBe(true);
  });

  it('accepts current car plates', () => {
    expect(isValidPlate('A1B234')).toBe(true);
  });

  it('accepts motorcycle / older car plates', () => {
    expect(isValidPlate('AB1234')).toBe(true);
  });

  it('accepts special plates', () => {
    expect(isValidPlate('EUA123')).toBe(true);
  });

  it('accepts formatted classic plates after normalization', () => {
    expect(isValidPlate('abc-123')).toBe(true);
  });

  it('accepts formatted current plates after normalization', () => {
    expect(isValidPlate('a1b-234')).toBe(true);
  });

  it('accepts formatted motorcycle plates after normalization', () => {
    expect(isValidPlate('ab 1234')).toBe(true);
  });

  it('accepts formatted special plates after normalization', () => {
    expect(isValidPlate('e ua-123')).toBe(true);
  });

  it('rejects plates that are too short', () => {
    expect(isValidPlate('AB123')).toBe(false);
  });

  it('rejects plates that are too long', () => {
    expect(isValidPlate('ABCD1234')).toBe(false);
  });

  it('rejects plates with invalid characters', () => {
    expect(isValidPlate('ABC-12@')).toBe(false);
  });

  it('rejects plates with only letters', () => {
    expect(isValidPlate('ABCDEF')).toBe(false);
  });

  it('rejects plates with only digits', () => {
    expect(isValidPlate('123456')).toBe(false);
  });

  it('rejects empty plates', () => {
    expect(isValidPlate('')).toBe(false);
  });

  it('rejects whitespace-only plates', () => {
    expect(isValidPlate('   ')).toBe(false);
  });
});
