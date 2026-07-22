import { Reflector } from '@nestjs/core';
import { RoleName, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersController } from './work-orders.controller';
import type { WorkOrdersService } from './work-orders.service';

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

describe('WorkOrdersController', () => {
  let controller: WorkOrdersController;
  let workOrdersService: WorkOrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    workOrdersService = {
      transitionStatus: jest.fn(),
    } as unknown as WorkOrdersService;
    controller = new WorkOrdersController(workOrdersService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', WorkOrdersController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('restricts transitionStatus to Admin, Reception and Mechanic', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        WorkOrdersController.prototype.transitionStatus,
        WorkOrdersController,
      ]);
      expect(roles).toEqual([
        RoleName.Admin,
        RoleName.Reception,
        RoleName.Mechanic,
      ]);
    });
  });

  describe('transitionStatus', () => {
    it('delegates to the service with the id and target status', async () => {
      const updated = { id: 'wo-1', status: 'in_progress' };
      (workOrdersService.transitionStatus as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.transitionStatus('wo-1', {
        status: WorkOrderStatus.in_progress,
      });

      expect(workOrdersService.transitionStatus).toHaveBeenCalledWith(
        'wo-1',
        WorkOrderStatus.in_progress
      );
      expect(result).toEqual(updated);
    });
  });
});
