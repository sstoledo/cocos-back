import type { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      employee: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new EmployeesService(prisma);
  });

  describe('findAll', () => {
    it('returns active employees ordered by name with select fields', async () => {
      const employees = [
        { id: 'emp-1', name: 'Ana Pérez', specialty: 'Mecánica', userId: null },
        {
          id: 'emp-2',
          name: 'Juan López',
          specialty: 'Electricidad',
          userId: 'user-1',
        },
      ];
      (prisma.employee.findMany as unknown as jest.Mock).mockResolvedValue(
        employees
      );

      const result = await service.findAll();

      expect(prisma.employee.findMany).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, specialty: true, userId: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(employees);
    });

    it('returns an empty array when there are no active employees', async () => {
      (prisma.employee.findMany as unknown as jest.Mock).mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
