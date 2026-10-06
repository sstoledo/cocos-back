import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { PresentationsController } from './presentations.controller';
import type { PresentationsService } from './presentations.service';

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

describe('PresentationsController', () => {
  let controller: PresentationsController;
  let presentationsService: PresentationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    presentationsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as PresentationsService;
    controller = new PresentationsController(presentationsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', PresentationsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PresentationsController.prototype.findAll,
        PresentationsController,
      ]);
      expect(roles).toEqual(
        expect.arrayContaining([
          RoleName.Admin,
          RoleName.Reception,
          RoleName.Mechanic,
          RoleName.Warehouse,
          RoleName.Purchasing,
          RoleName.ReadOnly,
        ])
      );
      expect(roles).toHaveLength(6);
    });

    it('allows all authenticated roles for findOne', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PresentationsController.prototype.findOne,
        PresentationsController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PresentationsController.prototype.create,
        PresentationsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts update to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PresentationsController.prototype.update,
        PresentationsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts remove to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PresentationsController.prototype.remove,
        PresentationsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });
  });

  describe('findAll', () => {
    it('returns the paginated list of presentations from the service', async () => {
      const paginatedResult = {
        data: [
          { id: 'pres-1', name: 'Galón' },
          { id: 'pres-2', name: 'Botella' },
        ],
        meta: { page: 1, limit: 10, total: 2 },
      };
      (presentationsService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginatedResult
      );

      const result = await controller.findAll({});

      expect(presentationsService.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('returns the presentation with the requested id', async () => {
      const presentation = { id: 'pres-1', name: 'Galón' };
      (presentationsService.findOne as unknown as jest.Mock).mockResolvedValue(
        presentation
      );

      const result = await controller.findOne('pres-1');

      expect(presentationsService.findOne).toHaveBeenCalledWith('pres-1');
      expect(result).toEqual(presentation);
    });
  });

  describe('create', () => {
    it('creates a presentation using the provided dto', async () => {
      const dto = { name: 'Galón' };
      const created = { id: 'pres-1', ...dto };
      (presentationsService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(presentationsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a presentation using the provided id and dto', async () => {
      const dto = { name: 'Galón Updated' };
      const updated = { id: 'pres-1', ...dto };
      (presentationsService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('pres-1', dto as never);

      expect(presentationsService.update).toHaveBeenCalledWith('pres-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the presentation with the requested id', async () => {
      const removed = { id: 'pres-1', name: 'Galón' };
      (presentationsService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('pres-1');

      expect(presentationsService.remove).toHaveBeenCalledWith('pres-1');
      expect(result).toEqual(removed);
    });
  });
});
