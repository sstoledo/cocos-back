import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePresentationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}
