import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePresentationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
