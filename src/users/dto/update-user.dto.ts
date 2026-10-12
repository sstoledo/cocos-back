import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  roleId?: string;

  @IsOptional()
  isActive?: boolean;

  /**
   * Employee primary key (cuid) to link this user to.
   * `null` unlinks the user's current employee; absent leaves it unchanged.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeId?: string | null;
}
