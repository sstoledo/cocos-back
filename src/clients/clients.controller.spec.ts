import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ClientsController } from './clients.controller';
import type { ClientsService } from './clients.service';

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

describe('ClientsController', () => {
  let controller: ClientsController;
  let clientsService: ClientsService;

  beforeEach(() => {
    jest.clearAllMocks();
    clientsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as ClientsService;
    controller = new ClientsController(clientsService);
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
      const guards = Reflect.getMetadata('__guards__', ClientsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ClientsController.prototype.findAll,
        ClientsController,
      ]);
      expect(roles).toEqual(allRoles);
    });

    it('allows all authenticated roles for findOne', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ClientsController.prototype.findOne,
        ClientsController,
      ]);
      expect(roles).toEqual(allRoles);
    });

    it('restricts create to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ClientsController.prototype.create,
        ClientsController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });

    it('restricts update to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ClientsController.prototype.update,
        ClientsController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });

    it('restricts remove to Admin and Reception', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ClientsController.prototype.remove,
        ClientsController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Reception]);
    });
  });

  describe('findAll', () => {
    it('returns the paginated list of clients from the service', async () => {
      const paginated = {
        data: [{ id: 'client-1', name: 'Juan Pérez' }],
        meta: { page: 1, limit: 10, total: 1 },
      };
      (clientsService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginated
      );

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(clientsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('returns the client with the requested id', async () => {
      const client = { id: 'client-1', name: 'Juan Pérez' };
      (clientsService.findOne as unknown as jest.Mock).mockResolvedValue(
        client
      );

      const result = await controller.findOne('client-1');

      expect(clientsService.findOne).toHaveBeenCalledWith('client-1');
      expect(result).toEqual(client);
    });
  });

  describe('create', () => {
    it('creates a client using the provided dto', async () => {
      const dto = {
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      };
      const created = { id: 'client-1', ...dto };
      (clientsService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(clientsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a client using the provided id and dto', async () => {
      const dto = { name: 'Juan Pérez Actualizado' };
      const updated = { id: 'client-1', ...dto };
      (clientsService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('client-1', dto as never);

      expect(clientsService.update).toHaveBeenCalledWith('client-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('soft-deletes the client with the requested id', async () => {
      const removed = { id: 'client-1', isActive: false };
      (clientsService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('client-1');

      expect(clientsService.remove).toHaveBeenCalledWith('client-1');
      expect(result).toEqual(removed);
    });
  });
});
