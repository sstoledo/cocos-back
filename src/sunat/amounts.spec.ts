import { montoEnLetras, splitTax } from './amounts';

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('splitTax', () => {
  it('splits an IGV-inclusive total into base, IGV and total (18%)', () => {
    expect(splitTax(118)).toEqual({ base: 100, igv: 18, total: 118 });
    expect(splitTax(45)).toEqual({
      base: round2(45 / 1.18),
      igv: round2(45 - 45 / 1.18),
      total: 45,
    });
  });

  it('handles totals with cents', () => {
    const { base, igv, total } = splitTax(30500.5);
    expect(round2(base + igv)).toBe(total);
    expect(total).toBe(30500.5);
  });

  it('returns zero amounts for a zero total', () => {
    expect(splitTax(0)).toEqual({ base: 0, igv: 0, total: 0 });
  });
});

describe('montoEnLetras', () => {
  it('renders whole soles with cents over 100', () => {
    expect(montoEnLetras(275)).toBe(
      'SON: DOSCIENTOS SETENTA Y CINCO CON 00/100 SOLES'
    );
    expect(montoEnLetras(1)).toBe('SON: UN CON 00/100 SOLES');
    expect(montoEnLetras(21)).toBe('SON: VEINTIUN CON 00/100 SOLES');
  });

  it('renders tens, hundreds and thousands correctly', () => {
    expect(montoEnLetras(11)).toBe('SON: ONCE CON 00/100 SOLES');
    expect(montoEnLetras(100)).toBe('SON: CIEN CON 00/100 SOLES');
    expect(montoEnLetras(115)).toBe('SON: CIENTO QUINCE CON 00/100 SOLES');
    expect(montoEnLetras(1000)).toBe('SON: MIL CON 00/100 SOLES');
    expect(montoEnLetras(2345)).toBe(
      'SON: DOS MIL TRESCIENTOS CUARENTA Y CINCO CON 00/100 SOLES'
    );
  });

  it('renders cents', () => {
    expect(montoEnLetras(15500.75)).toBe(
      'SON: QUINCE MIL QUINIENTOS CON 75/100 SOLES'
    );
    expect(montoEnLetras(0.5)).toBe('SON: CERO CON 50/100 SOLES');
  });

  it('renders millions', () => {
    expect(montoEnLetras(1000000)).toBe('SON: UN MILLON CON 00/100 SOLES');
  });
});
