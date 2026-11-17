import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type IdentificationDto = {
  identification?: string;
  identificationType?: string;
};

const RUC_PREFIXES = ['10', '15', '16', '17', '20'];
const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Validates a Peruvian RUC: 11 digits, an allowed issuing-entity prefix
 * (10/15/16/17/20) and the modulo-11 check digit used by SUNAT.
 */
export function isValidRuc(identification: string): boolean {
  if (!/^\d{11}$/.test(identification)) {
    return false;
  }

  if (!RUC_PREFIXES.includes(identification.slice(0, 2))) {
    return false;
  }

  const digits = identification.split('').map(Number);
  const weightedSum = digits
    .slice(0, 10)
    .reduce((sum, digit, index) => sum + digit * RUC_WEIGHTS[index], 0);
  const remainder = 11 - (weightedSum % 11);
  const expectedCheckDigit =
    remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return digits[10] === expectedCheckDigit;
}

@ValidatorConstraint({ name: 'IsValidIdentification', async: false })
export class IsValidIdentification implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as IdentificationDto;
    const { identification, identificationType } = object;

    if (!identification && !identificationType) {
      return true;
    }

    if (!identification || !identificationType) {
      return false;
    }

    if (identificationType === 'DNI') {
      return /^\d{8}$/.test(identification);
    }

    if (identificationType === 'RUC') {
      return isValidRuc(identification);
    }

    return false;
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as IdentificationDto;
    const { identificationType } = object;

    if (!identificationType) {
      return 'identificationType is required when identification is provided';
    }

    if (identificationType === 'DNI') {
      return 'DNI must be exactly 8 digits';
    }

    if (identificationType === 'RUC') {
      return 'RUC must be exactly 11 digits';
    }

    return 'identificationType must be DNI or RUC';
  }
}
