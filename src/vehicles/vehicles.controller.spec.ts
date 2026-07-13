import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { VehiclesController } from './vehicles.controller';
import type { VehiclesService } from './vehicles.service';

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

describe('VehiclesController', () => {
  let controller: VehiclesController;
  let vehiclesService: VehiclesService;

  beforeEach(() => {
    jest.clearAllMocks();
    vehiclesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as VehiclesService;
    controller = new VehiclesController(vehiclesService);
  });

  const allRoles = [
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly,
  ];

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', VehiclesController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        VehiclesController.prototype.findAll,
        VehiclesController,
      ]);
      expect(roles).toEqual(allRoles);
    });

    it('allows all authenticated roles for findOne', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        VehiclesController.prototype.findOne,
        VehiclesController,
      ]);
      expect(roles).toEqual(allRoles);
    });

    it('restricts create to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        VehiclesController.prototype.create,
        VehiclesController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });

    it('restricts update to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        VehiclesController.prototype.update,
        VehiclesController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });

    it('restricts remove to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        VehiclesController.prototype.remove,
        VehiclesController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });
  });

  describe('findAll', () => {
    it('returns the paginated list of vehicles from the service', async () => {
      const paginated = {
        data: [{ id: 'vehicle-1', plate: 'ABC123' }],
        meta: { page: 1, limit: 10, total: 1 },
      };
      (vehiclesService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginated
      );

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(vehiclesService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('returns the vehicle with the requested id', async () => {
      const vehicle = { id: 'vehicle-1', plate: 'ABC123' };
      (vehiclesService.findOne as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );

      const result = await controller.findOne('vehicle-1');

      expect(vehiclesService.findOne).toHaveBeenCalledWith('vehicle-1');
      expect(result).toEqual(vehicle);
    });
  });

  describe('create', () => {
    it('creates a vehicle using the provided dto', async () => {
      const dto = {
        plate: 'ABC123',
        brand: 'Toyota',
        model: 'Corolla',
        clientId: 'client-1',
      };
      const created = { id: 'vehicle-1', ...dto };
      (vehiclesService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(vehiclesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a vehicle using the provided id and dto', async () => {
      const dto = { brand: 'Honda' };
      const updated = { id: 'vehicle-1', ...dto };
      (vehiclesService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('vehicle-1', dto as never);

      expect(vehiclesService.update).toHaveBeenCalledWith('vehicle-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('soft-deletes the vehicle with the requested id', async () => {
      const removed = { id: 'vehicle-1', isActive: false };
      (vehiclesService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('vehicle-1');

      expect(vehiclesService.remove).toHaveBeenCalledWith('vehicle-1');
      expect(result).toEqual(removed);
    });
  });
});
