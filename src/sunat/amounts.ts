const IGV_RATE = 1.18;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits a SUNAT total (IGV included, as stored on sales) into the taxable
 * base and the IGV amount, keeping base + igv == total.
 */
export function splitTax(inclusiveTotal: number): {
  base: number;
  igv: number;
  total: number;
} {
  const total = round2(inclusiveTotal);
  const base = round2(total / IGV_RATE);
  return { base, igv: round2(total - base), total };
}

const UNIDADES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];

const DECENAS = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function ceroANoventaYCinco(n: number): string {
  if (n <= 20) {
    return UNIDADES[n];
  }
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  if (n < 30) {
    return `VEINTI${UNIDADES[unidad]}`;
  }
  return unidad === 0
    ? DECENAS[decena]
    : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
}

function ceroANovecientosNoventaYNueve(n: number): string {
  if (n === 100) {
    return 'CIEN';
  }
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  if (centena === 0) {
    return ceroANoventaYCinco(resto);
  }
  return resto === 0
    ? CENTENAS[centena]
    : `${CENTENAS[centena]} ${ceroANoventaYCinco(resto)}`;
}

function seccionMiles(n: number): string {
  if (n < 1000) {
    return ceroANovecientosNoventaYNueve(n);
  }
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const milesTexto = miles === 1 ? 'MIL' : `${ceroANoventaNueveMil(miles)} MIL`;
  return resto === 0
    ? milesTexto
    : `${milesTexto} ${ceroANovecientosNoventaYNueve(resto)}`;
}

function ceroANoventaNueveMil(n: number): string {
  return ceroANovecientosNoventaYNueve(n);
}

function millones(n: number): string {
  if (n < 1000000) {
    return seccionMiles(n);
  }
  const millon = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const millonTexto =
    millon === 1 ? 'UN MILLON' : `${seccionMiles(millon)} MILLONES`;
  return resto === 0 ? millonTexto : `${millonTexto} ${seccionMiles(resto)}`;
}

/** SUNAT legend: "SON: <amount in words> CON <cents>/100 SOLES". */
export function montoEnLetras(amount: number): string {
  const cents = Math.round((amount - Math.floor(amount)) * 100);
  const whole = Math.floor(amount);
  const words = whole === 0 ? 'CERO' : millones(whole);
  return `SON: ${words} CON ${String(cents).padStart(2, '0')}/100 SOLES`;
}
