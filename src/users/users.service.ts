import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const USER_INCLUDE = {
  role: { select: { id: true, name: true } },
} as const;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
  }

  async findAll(queryDto: ListUsersQueryDto) {
    const { page = 1, limit = 20, q, roleId, isActive } = queryDto;

    const where: Prisma.UserWhereInput = {};

    if (q !== undefined) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (roleId !== undefined) {
      where.roleId = roleId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: USER_INCLUDE,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((user) => this.toResponse(user)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
    if (!user) {
      throw new NotFoundException();
    }
    return this.toResponse(user);
  }

  async create(dto: CreateUserDto) {
    try {
      // Note: Password is handled by better-auth via Account model.
      // Admin creates user; user sets password via better-auth reset flow on first login.
      const user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          email: dto.email,
          name: dto.name,
          roleId: dto.roleId,
        },
        include: USER_INCLUDE,
      });
      return this.toResponse(user);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          roleId: dto.roleId,
          isActive: dto.isActive,
        },
        include: USER_INCLUDE,
      });
      return this.toResponse(user);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: USER_INCLUDE,
    });
    return this.toResponse(user);
  }

  async assignRole(id: string, roleId: string) {
    await this.findOne(id);

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        errorCode: 'ROLE_NOT_FOUND',
      });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { roleId },
      include: USER_INCLUDE,
    });
    return this.toResponse(user);
  }

  private toResponse(user: UserWithRole): UserResponseDto {
    const { emailVerified, image, ...rest } = user;
    return new UserResponseDto(rest);
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        message: 'Email already exists',
        errorCode: 'USER_EMAIL_CONFLICT',
      });
    }
    throw error;
  }
}
