const PLATE_REGEXES = [
  /^[A-Z]{3}[0-9]{3}$/,
  /^[A-Z][0-9][A-Z][0-9]{3}$/,
  /^[A-Z]{2}[0-9]{4}$/,
  /^E[A-Z]{2}[0-9]{3}$/,
];

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().trim().replace(/[-\s]/g, '');
}

export function isValidPlate(plate: string): boolean {
  return PLATE_REGEXES.some((regex) => regex.test(normalizePlate(plate)));
}
