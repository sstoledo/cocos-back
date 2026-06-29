import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    const findUnique = jest.fn();
    prisma = { user: { findUnique } } as unknown as PrismaService;
    service = new UsersService(prisma);
  });

  it('returns the user with role relation for the given id', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      role: { id: 'role-1', name: 'Admin' },
    };
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(user);

    const result = await service.findMe('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: { role: true },
    });
    expect(result).toEqual(user);
  });
});
