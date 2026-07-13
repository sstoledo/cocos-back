import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { IsValidIdentification } from '../validators/identification.validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  identification?: string;

  @IsOptional()
  @IsString()
  @IsIn(['DNI', 'RUC'])
  identificationType?: string;

  @Validate(IsValidIdentification, ['identification', 'identificationType'])
  readonly identificationValidation?: unknown;
}
