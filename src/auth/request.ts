import type { Role, User } from '@prisma/client';
import type { Request } from 'express';

export interface RequestWithUser extends Request {
  user?: User & { role: Role };
}
