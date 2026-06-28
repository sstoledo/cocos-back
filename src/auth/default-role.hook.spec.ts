import { type PrismaClient, RoleName } from '@prisma/client';
import { createDefaultRoleAssignmentHook } from './default-role.hook';

describe('createDefaultRoleAssignmentHook', () => {
  const mockPrisma = {
    role: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assigns the Reception role id to new users', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({
      id: 'role-reception',
      name: RoleName.Reception,
    });

    const hook = createDefaultRoleAssignmentHook(
      mockPrisma as unknown as PrismaClient
    );
    const result = await hook({ email: 'test@example.com' });

    expect(result).toEqual({
      data: {
        email: 'test@example.com',
        roleId: 'role-reception',
      },
    });
    expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: RoleName.Reception },
    });
  });

  it('throws a clear error when the Reception role is missing', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null);

    const hook = createDefaultRoleAssignmentHook(
      mockPrisma as unknown as PrismaClient
    );

    await expect(hook({ email: 'test@example.com' })).rejects.toThrow(
      'Run `pnpm exec prisma db seed` first'
    );
  });
});
