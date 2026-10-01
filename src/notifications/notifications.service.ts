import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Notification,
  NotificationType,
  Prisma,
  RoleName,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  link: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates one notification per user holding any of the given roles.
   * Accepts a transaction client so callers can run it inside their own
   * $transaction: generation failure rolls back the business event
   * (atomic consistency — B11 binding decision).
   */
  async createForRole(
    client: Prisma.TransactionClient,
    roles: RoleName[],
    payload: NotificationPayload
  ): Promise<void> {
    const users = await client.user.findMany({
      where: { role: { name: { in: roles } } },
      select: { id: true },
    });

    if (users.length === 0) {
      return;
    }

    await client.notification.createMany({
      data: users.map((user) => ({ userId: user.id, ...payload })),
    });
  }

  async findAllForUser(userId: string, queryDto: ListNotificationsQueryDto) {
    const { page = 1, limit = 20, unread } = queryDto;
    const where: Prisma.NotificationWhereInput = { userId };

    if (unread === 'true') {
      where.readAt = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: data.map((notification) => this.toResponse(notification)),
      meta: { page, limit, total },
    };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Notification not found',
        errorCode: 'NOTIFICATION_NOT_FOUND',
      });
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    return this.toResponse(notification as Notification);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }

  private toResponse(notification: Notification): NotificationResponseDto {
    return plainToInstance(
      NotificationResponseDto,
      {
        ...notification,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      },
      { excludeExtraneousValues: true }
    );
  }
}
