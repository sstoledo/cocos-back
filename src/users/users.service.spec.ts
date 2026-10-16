import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    const findUnique = jest.fn();
    prisma = { user: { findUnique } } as unknown as PrismaService;
    service = new UsersService(prisma);
  });

  it('returns the user with role and employeeId for the given id', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      role: { id: 'role-1', name: 'Admin' },
      employee: { id: 'emp-1', name: 'Juan' },
    };
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(user);

    const result = await service.findMe('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: {
        role: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
    });
    expect(result).toMatchObject({
      id: 'user-1',
      employeeId: 'emp-1',
      employee: { id: 'emp-1', name: 'Juan' },
    });
  });

  it('returns null when the user does not exist', async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    await expect(service.findMe('missing')).resolves.toBeNull();
  });

  describe('create with employeeId', () => {
    let tx: {
      employee: {
        findUnique: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      user: {
        create: jest.Mock;
        update: jest.Mock;
        findUniqueOrThrow: jest.Mock;
      };
    };

    beforeEach(() => {
      tx = {
        employee: {
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        user: {
          create: jest.fn(),
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
      };
      prisma = {
        $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
      } as unknown as PrismaService;
      service = new UsersService(prisma);
    });

    it('links the employee to the created user inside a transaction', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: true,
        deletedAt: null,
        userId: null,
      });
      tx.user.create.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        name: 'A',
        isActive: true,
        role: { id: 'role-1', name: 'Admin' },
        employee: { id: 'emp-1', name: 'Emp' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create({
        email: 'a@b.com',
        name: 'A',
        password: 'password123',
        roleId: 'role-1',
        employeeId: 'emp-1',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { userId: 'user-1' },
      });
      expect(result.employeeId).toBe('emp-1');
    });

    it('creates the user without touching employees when employeeId is absent', async () => {
      tx.user.create.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        role: { id: 'role-1', name: 'Admin' },
        employee: null,
      });

      await service.create({
        email: 'a@b.com',
        name: 'A',
        password: 'password123',
        roleId: 'role-1',
      });

      expect(tx.employee.findUnique).not.toHaveBeenCalled();
      expect(tx.employee.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      tx.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          email: 'a@b.com',
          name: 'A',
          password: 'password123',
          roleId: 'role-1',
          employeeId: 'emp-404',
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_NOT_FOUND' },
      });
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the employee is inactive', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: false,
        deletedAt: null,
        userId: null,
      });

      await expect(
        service.create({
          email: 'a@b.com',
          name: 'A',
          password: 'password123',
          roleId: 'role-1',
          employeeId: 'emp-1',
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_NOT_FOUND' },
      });
    });

    it('throws ConflictException when the employee is linked to another user', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: true,
        deletedAt: null,
        userId: 'other-user',
      });

      await expect(
        service.create({
          email: 'a@b.com',
          name: 'A',
          password: 'password123',
          roleId: 'role-1',
          employeeId: 'emp-1',
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_ALREADY_LINKED' },
      });
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });

  describe('update with employeeId', () => {
    let tx: {
      employee: {
        findUnique: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      user: {
        create: jest.Mock;
        update: jest.Mock;
        findUniqueOrThrow: jest.Mock;
      };
    };

    beforeEach(() => {
      tx = {
        employee: {
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        user: {
          create: jest.fn(),
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
      };
      const findUnique = jest.fn().mockResolvedValue({ id: 'user-1' });
      prisma = {
        user: { findUnique },
        $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
      } as unknown as PrismaService;
      service = new UsersService(prisma);
    });

    it('links the employee to the updated user', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: true,
        deletedAt: null,
        userId: null,
      });
      tx.user.update.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        role: { id: 'role-1', name: 'Admin' },
        employee: { id: 'emp-1', name: 'Emp' },
      });

      const result = await service.update('user-1', { employeeId: 'emp-1' });

      expect(tx.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { userId: 'user-1' },
      });
      expect(result.employeeId).toBe('emp-1');
    });

    it('re-linking the same user to their own employee is idempotent', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: true,
        deletedAt: null,
        userId: 'user-1',
      });
      tx.user.update.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        role: { id: 'role-1', name: 'Admin' },
        employee: { id: 'emp-1', name: 'Emp' },
      });

      await service.update('user-1', { employeeId: 'emp-1' });

      expect(tx.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { userId: 'user-1' },
      });
    });

    it('throws ConflictException when the employee belongs to another user', async () => {
      tx.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        isActive: true,
        deletedAt: null,
        userId: 'other-user',
      });

      await expect(
        service.update('user-1', { employeeId: 'emp-1' })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_ALREADY_LINKED' },
      });
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the employee does not exist', async () => {
      tx.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-1', { employeeId: 'emp-404' })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_NOT_FOUND' },
      });
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('unlinks the current employee when employeeId is null', async () => {
      tx.user.update.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        role: { id: 'role-1', name: 'Admin' },
        employee: null,
      });

      await service.update('user-1', { employeeId: null });

      expect(tx.employee.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null },
      });
      expect(tx.employee.findUnique).not.toHaveBeenCalled();
    });

    it('does not touch employees when employeeId is undefined', async () => {
      tx.user.update.mockResolvedValue({ id: 'user-1' });
      tx.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        role: { id: 'role-1', name: 'Admin' },
        employee: { id: 'emp-1', name: 'Emp' },
      });

      await service.update('user-1', { name: 'New Name' });

      expect(tx.employee.findUnique).not.toHaveBeenCalled();
      expect(tx.employee.update).not.toHaveBeenCalled();
      expect(tx.employee.updateMany).not.toHaveBeenCalled();
    });
  });
});
