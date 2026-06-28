import { type PrismaClient, RoleName } from '@prisma/client';

export function createDefaultRoleAssignmentHook(prismaClient: PrismaClient) {
  return async function defaultRoleAssignmentHook(
    user: Record<string, unknown>
  ) {
    const receptionRole = await prismaClient.role.findUnique({
      where: { name: RoleName.Reception },
    });

    if (!receptionRole) {
      throw new Error(
        'Default "Reception" role not found. Run `pnpm exec prisma db seed` first.'
      );
    }

    return {
      data: {
        ...user,
        roleId: receptionRole.id,
      },
    };
  };
}
