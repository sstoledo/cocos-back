import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('finds the current user with role', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: { id: 'role-1', name: 'Reception' },
    };
    mockPrismaService.user.findUnique.mockResolvedValue(user);

    const result = await service.findMe('user-1');

    expect(result).toEqual(user);
    expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: { role: true },
    });
  });

  it('returns null when the user is not found', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    const result = await service.findMe('missing');

    expect(result).toBeNull();
    expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing' },
      include: { role: true },
    });
  });
});
