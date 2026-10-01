import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { NotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

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

const ALL_ROLES = [
  RoleName.Admin,
  RoleName.Reception,
  RoleName.Mechanic,
  RoleName.Warehouse,
  RoleName.Purchasing,
  RoleName.ReadOnly,
];

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: NotificationsService;

  const request = {
    user: { id: 'user-1' },
  } as unknown as RequestWithUser;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationsService = {
      findAllForUser: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    } as unknown as NotificationsService;
    controller = new NotificationsController(notificationsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', NotificationsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it.each(['findAll', 'markRead', 'markAllRead'] as const)(
      'allows all authenticated roles including ReadOnly for %s',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          NotificationsController.prototype[method],
          NotificationsController,
        ]);
        expect(roles).toEqual(expect.arrayContaining(ALL_ROLES));
        expect(roles).toHaveLength(6);
      }
    );
  });

  describe('findAll', () => {
    it('delegates to the service with the session user id and query', async () => {
      const query = { unread: 'true', page: 1, limit: 20 };
      const payload = { data: [], meta: { page: 1, limit: 20, total: 0 } };
      (
        notificationsService.findAllForUser as unknown as jest.Mock
      ).mockResolvedValue(payload);

      const result = await controller.findAll(request, query);

      expect(notificationsService.findAllForUser).toHaveBeenCalledWith(
        'user-1',
        query
      );
      expect(result).toEqual(payload);
    });
  });

  describe('markRead', () => {
    it('delegates to the service with the session user id and notification id', async () => {
      const notification = { id: 'notif-1' };
      (notificationsService.markRead as unknown as jest.Mock).mockResolvedValue(
        notification
      );

      const result = await controller.markRead(request, 'notif-1');

      expect(notificationsService.markRead).toHaveBeenCalledWith(
        'user-1',
        'notif-1'
      );
      expect(result).toEqual(notification);
    });
  });

  describe('markAllRead', () => {
    it('delegates to the service with the session user id', async () => {
      (
        notificationsService.markAllRead as unknown as jest.Mock
      ).mockResolvedValue({ count: 2 });

      const result = await controller.markAllRead(request);

      expect(notificationsService.markAllRead).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ count: 2 });
    });
  });
});
