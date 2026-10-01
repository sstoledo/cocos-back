import { NotFoundException } from '@nestjs/common';
import { NotificationType, RoleName } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const notificationRecord = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.work_order_ready,
    title: 'Orden de trabajo OT-2026-000001 lista',
    body: 'La orden de trabajo está lista para entrega',
    link: '/work-orders/wo-1',
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new NotificationsService(prisma);
  });

  describe('findAllForUser', () => {
    it('lists only own notifications, newest first, with pagination meta', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        notificationRecord,
      ]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAllForUser('user-1', {
        page: 2,
        limit: 20,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 20,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual({
        data: [
          {
            id: 'notif-1',
            type: 'work_order_ready',
            title: 'Orden de trabajo OT-2026-000001 lista',
            body: 'La orden de trabajo está lista para entrega',
            link: '/work-orders/wo-1',
            readAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        meta: { page: 2, limit: 20, total: 1 },
      });
    });

    it('defaults to page 1 and limit 20', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllForUser('user-1', {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
    });

    it('filters to unread notifications when unread is true', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await service.findAllForUser('user-1', { unread: 'true' });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });

    it('serializes readAt as an ISO string when present', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        { ...notificationRecord, readAt: new Date('2026-01-02T10:30:00.000Z') },
      ]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAllForUser('user-1', {});

      expect(result.data[0].readAt).toBe('2026-01-02T10:30:00.000Z');
    });
  });

  describe('markRead', () => {
    it('marks an own unread notification as read and returns it', async () => {
      const readAt = new Date('2026-01-02T10:30:00.000Z');
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue({
        ...notificationRecord,
        readAt,
      });

      const result = await service.markRead('user-1', 'notif-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({
        id: 'notif-1',
        type: 'work_order_ready',
        title: 'Orden de trabajo OT-2026-000001 lista',
        body: 'La orden de trabajo está lista para entrega',
        link: '/work-orders/wo-1',
        readAt: '2026-01-02T10:30:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('throws 404 NOTIFICATION_NOT_FOUND when the notification belongs to another user', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.markRead('user-2', 'notif-1')).rejects.toMatchObject(
        {
          constructor: NotFoundException,
          response: { errorCode: 'NOTIFICATION_NOT_FOUND' },
        }
      );
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-2', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('throws 404 NOTIFICATION_NOT_FOUND when the notification is already read', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.markRead('user-1', 'notif-1')).rejects.toMatchObject(
        {
          constructor: NotFoundException,
          response: { errorCode: 'NOTIFICATION_NOT_FOUND' },
        }
      );
    });
  });

  describe('createForRole', () => {
    const payload = {
      type: NotificationType.work_order_ready,
      title: 'Orden de trabajo OT-2026-000001 lista',
      body: 'Cliente: María García — Vehículo: Toyota Corolla (ABC123)',
      link: '/work-orders/wo-1',
    };

    it('creates one notification per user holding any of the given roles', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      await service.createForRole(
        prisma,
        [RoleName.Admin, RoleName.Reception],
        payload
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { name: { in: [RoleName.Admin, RoleName.Reception] } } },
        select: { id: true },
      });
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', ...payload },
          { userId: 'user-2', ...payload },
          { userId: 'user-3', ...payload },
        ],
      });
    });

    it('writes through the provided transaction client instead of the global prisma', async () => {
      const tx = {
        user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-9' }]) },
        notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };

      // biome-ignore lint/suspicious/noExplicitAny: test mock types
      await service.createForRole(tx as any, [RoleName.Admin], payload);

      expect(tx.user.findMany).toHaveBeenCalled();
      expect(tx.notification.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-9', ...payload }],
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('is a no-op when no user matches the roles', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      await service.createForRole(prisma, [RoleName.ReadOnly], payload);

      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('marks all own unread notifications as read and returns the count', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const result = await service.markAllRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 3 });
    });

    it('returns zero when there is nothing to mark', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const result = await service.markAllRead('user-1');

      expect(result).toEqual({ count: 0 });
    });
  });
});
