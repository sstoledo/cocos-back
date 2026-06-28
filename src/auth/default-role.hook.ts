import type { PrismaClient, RoleName } from '@prisma/client';

export const DEFAULT_ROLE_NAME: RoleName = 'Reception';

export type UserCreateData = Record<string, unknown>;

export interface AssignDefaultRoleResult {
  roleId: string;
}

export async function assignDefaultRole(
  prisma: PrismaClient,
  _user: UserCreateData
): Promise<AssignDefaultRoleResult> {
  const role = await prisma.role.findUnique({
    where: { name: DEFAULT_ROLE_NAME },
  });

  if (!role) {
    throw new Error(`Default role ${DEFAULT_ROLE_NAME} not found`);
  }

  return { roleId: role.id };
}

export function createAssignDefaultRoleHook(prisma: PrismaClient) {
  return async (user: UserCreateData) => {
    const { roleId } = await assignDefaultRole(prisma, user);
    return { data: { ...user, roleId } };
  };
}
