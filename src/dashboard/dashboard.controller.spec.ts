import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { RolesGuard, auth } from '../auth';
import type { PrismaService } from '../prisma/prisma.service';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';

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

const DASHBOARD_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
];

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: DashboardService;

  const request = {
    user: { id: 'user-1' },
  } as unknown as RequestWithUser;

  beforeEach(() => {
    jest.clearAllMocks();
    dashboardService = {
      summary: jest.fn(),
    } as unknown as DashboardService;
    controller = new DashboardController(dashboardService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', DashboardController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows every role except Mechanic for summary', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        DashboardController.prototype.summary,
        DashboardController,
      ]);
      expect(roles).toEqual(expect.arrayContaining(DASHBOARD_ROLES));
      expect(roles).not.toContain(RoleName.Mechanic);
      expect(roles).toHaveLength(5);
    });
  });

  describe('summary', () => {
    it('delegates to the service with the session user id', async () => {
      const payload = {
        salesTodayCount: 1,
        salesMonthCount: 2,
        workOrders: {
          pending: 3,
          inProgress: 4,
          done: 5,
          cancelled: 6,
        },
        purchaseOrders: {
          draft: 7,
          ordered: 8,
          partiallyReceived: 9,
          received: 10,
          cancelled: 11,
        },
        notificationsUnread: 12,
        generatedAt: '2026-09-30T14:00:00.000Z',
      };
      (dashboardService.summary as unknown as jest.Mock).mockResolvedValue(
        payload
      );

      const result = await controller.summary(request);

      expect(dashboardService.summary).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(payload);
    });
  });

  describe('unauthenticated access', () => {
    const createContext = (request: { headers: Record<string, string> }) =>
      ({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => DashboardController.prototype.summary,
        getClass: () => DashboardController,
      }) as unknown as Parameters<RolesGuard['canActivate']>[0];

    it('throws UnauthorizedException when there is no session', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
      const prisma = {
        user: { findUnique: jest.fn() },
      } as unknown as PrismaService;
      const guard = new RolesGuard(new Reflector(), prisma);

      const context = createContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(dashboardService.summary).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the session user has no role', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const guard = new RolesGuard(new Reflector(), prisma);

      const context = createContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(dashboardService.summary).not.toHaveBeenCalled();
    });
    it('throws ForbiddenException when the user is a Mechanic', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: 'user-mechanic' },
      });
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-mechanic',
            role: { name: RoleName.Mechanic },
          }),
        },
      } as unknown as PrismaService;
      const guard = new RolesGuard(new Reflector(), prisma);

      const context = createContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(dashboardService.summary).not.toHaveBeenCalled();
    });

    it('allows a non-mechanic role through the guard', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: 'user-admin' },
      });
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-admin',
            role: { name: RoleName.Admin },
          }),
        },
      } as unknown as PrismaService;
      const guard = new RolesGuard(new Reflector(), prisma);

      const context = createContext({ headers: {} });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
