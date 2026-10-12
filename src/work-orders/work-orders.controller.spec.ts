import { Reflector } from '@nestjs/core';
import { RoleName, WorkOrderStatus } from '@prisma/client';
import type { RequestWithUser } from '../auth';
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
      findAll: jest.fn(),
      findOne: jest.fn(),
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

  describe('findAll', () => {
    it('delegates to the service with the query and the session user', async () => {
      const request = {
        user: { id: 'user-1', role: { name: RoleName.Mechanic } },
      } as unknown as RequestWithUser;
      const page = { data: [], meta: { page: 1, limit: 10, total: 0 } };
      (workOrdersService.findAll as jest.Mock).mockResolvedValue(page);

      const result = await controller.findAll({ page: 1, limit: 10 }, request);

      expect(workOrdersService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        request.user
      );
      expect(result).toEqual(page);
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the id and the session user', async () => {
      const request = {
        user: { id: 'user-1', role: { name: RoleName.Admin } },
      } as unknown as RequestWithUser;
      const order = { id: 'wo-1' };
      (workOrdersService.findOne as jest.Mock).mockResolvedValue(order);

      const result = await controller.findOne('wo-1', request);

      expect(workOrdersService.findOne).toHaveBeenCalledWith(
        'wo-1',
        request.user
      );
      expect(result).toEqual(order);
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
