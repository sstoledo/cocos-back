import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type IdentificationDto = {
  identification?: string;
  identificationType?: string;
};

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
      return /^\d{11}$/.test(identification);
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
