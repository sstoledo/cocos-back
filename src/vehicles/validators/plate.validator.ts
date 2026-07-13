import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidPlate } from '../../common/helpers/plate.helper';

@ValidatorConstraint({ name: 'IsValidPlate', async: false })
export class IsValidPlate implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    return isValidPlate(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid Peruvian plate`;
  }
}
