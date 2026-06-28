import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import type { PrismaService } from '../prisma/prisma.service';
import { auth } from './auth';
import { RolesGuard } from './role.guard';
import { ROLES_KEY } from './roles.decorator';

jest.mock('./auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers) => headers),
}));

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector = new Reflector();
    prisma = {
      user: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    guard = new RolesGuard(reflector, prisma);
  });

  class TestController {}

  const createContext = (
    request: { headers: Record<string, string>; user?: unknown },
    roles?: RoleName[]
  ) => {
    const handler = jest.fn();
    if (roles) {
      Reflect.defineMetadata(ROLES_KEY, roles, handler);
    }

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
      getClass: () => TestController,
    } as unknown as Parameters<RolesGuard['canActivate']>[0];
  };

  it('allows access when no roles are required', async () => {
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws UnauthorizedException when there is no session', async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);

    const context = createContext(
      { headers: { authorization: 'Bearer token' } },
      [RoleName.Admin]
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('throws UnauthorizedException when the user is not found', async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
    });
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const context = createContext(
      { headers: { authorization: 'Bearer token' } },
      [RoleName.Admin]
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('throws UnauthorizedException when the role relation is missing', async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
    });
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: 'user-1',
      role: null,
    });

    const context = createContext(
      { headers: { authorization: 'Bearer token' } },
      [RoleName.Admin]
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('throws ForbiddenException when the role is insufficient', async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
    });
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: 'user-1',
      role: { name: RoleName.Reception },
    });

    const context = createContext(
      { headers: { authorization: 'Bearer token' } },
      [RoleName.Admin]
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('attaches the user to the request and allows access when the role is allowed', async () => {
    const request = { headers: { authorization: 'Bearer token' } };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
    });
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: 'user-1',
      role: { name: RoleName.Admin },
    });

    const context = createContext(request, [RoleName.Admin]);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(fromNodeHeaders).toHaveBeenCalledWith(request.headers);
    expect(request).toHaveProperty('user', {
      id: 'user-1',
      role: { name: RoleName.Admin },
    });
  });
});
