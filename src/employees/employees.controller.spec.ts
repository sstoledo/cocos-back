import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { EmployeesController } from './employees.controller';
import type { EmployeesService } from './employees.service';

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

describe('EmployeesController', () => {
  let controller: EmployeesController;
  let employeesService: EmployeesService;

  beforeEach(() => {
    jest.clearAllMocks();
    employeesService = {
      findAll: jest.fn(),
    } as unknown as EmployeesService;
    controller = new EmployeesController(employeesService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', EmployeesController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows only Admin and Reception for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        EmployeesController.prototype.findAll,
        EmployeesController,
      ]);
      expect(roles).toEqual(
        expect.arrayContaining([RoleName.Admin, RoleName.Reception])
      );
      expect(roles).toHaveLength(2);
    });
  });

  describe('findAll', () => {
    it('returns the list of active employees from the service', async () => {
      const employees = [
        { id: 'emp-1', name: 'Ana Pérez', specialty: 'Mecánica', userId: null },
      ];
      (employeesService.findAll as unknown as jest.Mock).mockResolvedValue(
        employees
      );

      const result = await controller.findAll();

      expect(employeesService.findAll).toHaveBeenCalledWith();
      expect(result).toEqual(employees);
    });
  });
});
