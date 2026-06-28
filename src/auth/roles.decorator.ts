import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';
import type { RoleName } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RoleName[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
