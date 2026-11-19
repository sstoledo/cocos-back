import { UBIGEO_ROWS } from './ubigeo.data';

export type UbigeoEntry = {
  code: string;
  department: string;
  province: string;
  district: string;
};

/**
 * The INEI catalog SUNAT validates against in its catalog 13. Codes are the
 * only stored truth: the department/province/district names are derived from
 * here so a document can never carry a name that contradicts its code.
 */
export const UBIGEOS: readonly UbigeoEntry[] = UBIGEO_ROWS.map(
  ([code, department, province, district]) => ({
    code,
    department,
    province,
    district,
  })
);

const BY_CODE = new Map(UBIGEOS.map((entry) => [entry.code, entry]));

/** Strips case and diacritics so "Callería" matches the catalog's "Calleria". */
export const normalizeUbigeoText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const SEARCH_INDEX = UBIGEOS.map((entry) => ({
  entry,
  haystack: normalizeUbigeoText(
    `${entry.district} ${entry.province} ${entry.department} ${entry.code}`
  ),
  district: normalizeUbigeoText(entry.district),
}));

export const UBIGEO_DEFAULT_LIMIT = 20;
export const UBIGEO_MAX_LIMIT = 50;

export function findUbigeo(code: string): UbigeoEntry | undefined {
  return BY_CODE.get(code);
}

/**
 * Top-N search for the settings combobox. District prefix matches rank before
 * matches found elsewhere in the district/province/department, so typing
 * "miraf" surfaces Miraflores before a province named after it.
 */
export function searchUbigeos(
  query: string,
  limit = UBIGEO_DEFAULT_LIMIT
): UbigeoEntry[] {
  const capped = Math.min(Math.max(limit, 1), UBIGEO_MAX_LIMIT);
  const term = normalizeUbigeoText(query);

  if (!term) {
    return UBIGEOS.slice(0, capped);
  }

  const prefixes: UbigeoEntry[] = [];
  const rest: UbigeoEntry[] = [];

  for (const item of SEARCH_INDEX) {
    if (!item.haystack.includes(term)) {
      continue;
    }
    if (item.district.startsWith(term)) {
      prefixes.push(item.entry);
      if (prefixes.length === capped) {
        break;
      }
    } else {
      rest.push(item.entry);
    }
  }

  return [...prefixes, ...rest].slice(0, capped);
}
