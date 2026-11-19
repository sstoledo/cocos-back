import { UBIGEOS, findUbigeo, searchUbigeos } from './ubigeo.catalog';

describe('ubigeo catalog', () => {
  it('holds every district of Peru with a unique 6-digit code', () => {
    expect(UBIGEOS).toHaveLength(1874);

    const codes = new Set(UBIGEOS.map((entry) => entry.code));
    expect(codes.size).toBe(UBIGEOS.length);
    expect(UBIGEOS.every((entry) => /^\d{6}$/.test(entry.code))).toBe(true);
  });

  it('covers the 25 departments', () => {
    const departments = new Set(UBIGEOS.map((entry) => entry.department));

    expect(departments.size).toBe(25);
    expect(departments.has('Lima')).toBe(true);
    expect(departments.has('Callao')).toBe(true);
  });

  it('maps known codes to their department, province and district', () => {
    expect(findUbigeo('150101')).toEqual({
      code: '150101',
      department: 'Lima',
      province: 'Lima',
      district: 'Lima',
    });
    expect(findUbigeo('150122')).toMatchObject({
      province: 'Lima',
      district: 'Miraflores',
    });
    expect(findUbigeo('040101')).toMatchObject({
      department: 'Arequipa',
      district: 'Arequipa',
    });
    expect(findUbigeo('070101')).toMatchObject({ department: 'Callao' });
  });

  it('returns undefined for unknown codes', () => {
    expect(findUbigeo('999999')).toBeUndefined();
    expect(findUbigeo('15010')).toBeUndefined();
    expect(findUbigeo('')).toBeUndefined();
  });

  it('searches by district, province and department', () => {
    // "Miraflores" exists in several departments; the combobox label carries
    // province and department so the user disambiguates.
    const byDistrict = searchUbigeos('miraflores', 20);
    const codes = byDistrict.map((entry) => entry.code);

    expect(codes).toContain('150122');
    expect(codes).toContain('040110');
    expect(codes).toContain('150133'); // San Juan de Miraflores
    expect(
      byDistrict.every((entry) =>
        entry.district.toLowerCase().includes('miraflores')
      )
    ).toBe(true);
    // A district named exactly "Miraflores" ranks before one that only
    // contains the term.
    expect(codes.indexOf('150122')).toBeLessThan(codes.indexOf('150133'));

    const byProvince = searchUbigeos('coronel portillo', 20);
    expect(byProvince.length).toBeGreaterThan(0);
    expect(
      byProvince.every((entry) => entry.province === 'Coronel Portillo')
    ).toBe(true);
  });

  it('ignores case and accents in the search term', () => {
    const withAccent = searchUbigeos('Callería', 5);
    const withoutAccent = searchUbigeos('CALLERIA', 5);

    expect(withAccent[0]).toMatchObject({ code: '250101' });
    expect(withoutAccent[0]).toMatchObject({ code: '250101' });
  });

  it('ranks district prefix matches before containment matches', () => {
    const results = searchUbigeos('lima', 10);
    const firstContainment = results.findIndex(
      (entry) => !entry.district.toLowerCase().startsWith('lima')
    );

    if (firstContainment !== -1) {
      const after = results.slice(firstContainment);
      expect(
        after.every((entry) => !entry.district.toLowerCase().startsWith('lima'))
      ).toBe(true);
    }
    expect(results[0]?.district.toLowerCase().startsWith('lima')).toBe(true);
  });

  it('honours the limit and defaults to a bounded result set', () => {
    expect(searchUbigeos('a', 3)).toHaveLength(3);
    expect(searchUbigeos('', 5)).toHaveLength(5);
    expect(searchUbigeos('a', 10_000).length).toBeLessThanOrEqual(50);
  });
});
