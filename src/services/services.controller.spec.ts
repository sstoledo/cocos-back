import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ServicesController } from './services.controller';
import type { ServicesService } from './services.service';

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

describe('ServicesController', () => {
  let controller: ServicesController;
  let servicesService: ServicesService;

  const allRoles = [
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    servicesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as ServicesService;
    controller = new ServicesController(servicesService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', ServicesController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it.each([
      ['findAll', allRoles],
      ['findOne', allRoles],
      ['create', [RoleName.Admin, RoleName.Reception]],
      ['update', [RoleName.Admin, RoleName.Reception]],
      ['remove', [RoleName.Admin, RoleName.Reception]],
    ])('restricts %s to the expected roles', (method, expected) => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        (ServicesController.prototype as never)[method],
        ServicesController,
      ]);
      expect(roles).toEqual(expected);
    });
  });

  describe('delegation', () => {
    it('findAll returns paginated services', async () => {
      const paginated = {
        data: [{ id: 'svc-1', name: 'Oil change' }],
        meta: { page: 1, limit: 10, total: 1 },
      };
      (servicesService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginated
      );

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(servicesService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(paginated);
    });

    it('findOne returns the service by id', async () => {
      const service = { id: 'svc-1', name: 'Oil change' };
      (servicesService.findOne as unknown as jest.Mock).mockResolvedValue(
        service
      );

      const result = await controller.findOne('svc-1');

      expect(servicesService.findOne).toHaveBeenCalledWith('svc-1');
      expect(result).toEqual(service);
    });

    it('create delegates to the service', async () => {
      const dto = { code: 'OIL-001', name: 'Oil change', price: 25.5 };
      const created = { id: 'svc-1', ...dto };
      (servicesService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(servicesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });

    it('update delegates to the service', async () => {
      const dto = { name: 'Premium oil change' };
      const updated = { id: 'svc-1', ...dto };
      (servicesService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('svc-1', dto as never);

      expect(servicesService.update).toHaveBeenCalledWith('svc-1', dto);
      expect(result).toEqual(updated);
    });

    it('remove delegates to the service', async () => {
      const removed = { id: 'svc-1', isActive: false };
      (servicesService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('svc-1');

      expect(servicesService.remove).toHaveBeenCalledWith('svc-1');
      expect(result).toEqual(removed);
    });
  });
});
