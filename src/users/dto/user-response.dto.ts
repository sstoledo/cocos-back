import { RoleName } from '@prisma/client';
import { Exclude } from 'class-transformer';

export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: {
    id: string;
    name: RoleName;
  };
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  emailVerified: boolean;

  @Exclude()
  image: string | null;

  @Exclude()
  password?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
