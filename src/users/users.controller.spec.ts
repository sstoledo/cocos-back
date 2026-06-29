import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

jest.mock('../auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;

  beforeEach(() => {
    const findMe = jest.fn();
    usersService = { findMe } as unknown as UsersService;
    controller = new UsersController(usersService);
  });

  it('returns the current user from UsersService.findMe', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      role: { id: 'role-1', name: RoleName.Admin },
    };
    (usersService.findMe as unknown as jest.Mock).mockResolvedValue(user);

    const request = { user } as unknown as RequestWithUser;
    const result = await controller.findMe(request);

    expect(usersService.findMe).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(user);
  });
});
