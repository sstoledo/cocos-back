import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('./auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers)
  ),
}));

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';
import { RolesGuard } from './role.guard';

const mockedGetSession = auth.api.getSession as unknown as jest.Mock;

describe('RolesGuard', () => {
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  } as unknown as {
    user: {
      findUnique: jest.Mock;
    };
  };

  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(
      reflector,
      mockPrismaService as unknown as PrismaService
    );
    jest.clearAllMocks();
  });

  const createContext = (handler: unknown, request: unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('allows access when no roles are required', async () => {
    class TestController {
      handler() {
        return 'ok';
      }
    }

    const context = createContext(TestController.prototype.handler, {});

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when the user has a permitted role', async () => {
    class TestController {
      handler() {
        return 'ok';
      }
    }

    Reflect.defineMetadata(
      'roles',
      [RoleName.Admin, RoleName.Reception],
      TestController.prototype.handler
    );
    const request = { headers: { cookie: 'better-auth.session_token=abc' } };
    mockedGetSession.mockResolvedValue({
      session: { token: 'abc' },
      user: { id: 'user-1' },
    });
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: { name: RoleName.Reception },
    });

    const context = createContext(TestController.prototype.handler, request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(fromNodeHeaders).toHaveBeenCalledWith(request.headers);
    expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: { role: true },
    });
  });

  it('throws ForbiddenException when the user role is not allowed', async () => {
    class TestController {
      handler() {
        return 'ok';
      }
    }

    Reflect.defineMetadata(
      'roles',
      [RoleName.Admin],
      TestController.prototype.handler
    );
    mockedGetSession.mockResolvedValue({
      session: { token: 'abc' },
      user: { id: 'user-2' },
    });
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: { name: RoleName.Mechanic },
    });

    const context = createContext(TestController.prototype.handler, {});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('throws UnauthorizedException when the session is missing', async () => {
    class TestController {
      handler() {
        return 'ok';
      }
    }

    Reflect.defineMetadata(
      'roles',
      [RoleName.Admin],
      TestController.prototype.handler
    );
    mockedGetSession.mockResolvedValue(null);

    const context = createContext(TestController.prototype.handler, {});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
