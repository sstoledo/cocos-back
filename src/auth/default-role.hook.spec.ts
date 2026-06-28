import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_ROLE_NAME,
  assignDefaultRole,
  createAssignDefaultRoleHook,
} from './default-role.hook';

describe('DEFAULT_ROLE_NAME', () => {
  it('is Reception', () => {
    expect(DEFAULT_ROLE_NAME).toBe('Reception');
  });
});

describe('assignDefaultRole', () => {
  const findUnique = jest.fn();
  const prisma = { role: { findUnique } } as unknown as PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the Reception role id when found', async () => {
    findUnique.mockResolvedValue({ id: 'role-reception-id' });

    const result = await assignDefaultRole(prisma, {
      email: 'test@example.com',
    });

    expect(findUnique).toHaveBeenCalledWith({ where: { name: 'Reception' } });
    expect(result).toEqual({ roleId: 'role-reception-id' });
  });

  it('throws when the Reception role is not found', async () => {
    findUnique.mockResolvedValue(null);

    await expect(assignDefaultRole(prisma, {})).rejects.toThrow(
      'Default role Reception not found'
    );
  });
});

describe('createAssignDefaultRoleHook', () => {
  const findUnique = jest.fn();
  const prisma = { role: { findUnique } } as unknown as PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user data augmented with the default role id', async () => {
    findUnique.mockResolvedValue({ id: 'role-reception-id' });
    const hook = createAssignDefaultRoleHook(prisma);

    const result = await hook({ email: 'test@example.com' });

    expect(result).toEqual({
      data: { email: 'test@example.com', roleId: 'role-reception-id' },
    });
  });
});
