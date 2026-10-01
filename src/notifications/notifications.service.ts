import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
