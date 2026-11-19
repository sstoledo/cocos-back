import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(11)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  ubigeo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  facturaSeries?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  boletaSeries?: string;
}
