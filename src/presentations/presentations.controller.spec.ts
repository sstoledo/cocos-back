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
  });

  describe('findAll', () => {
    it('returns the list of presentations from the service', async () => {
      const presentations = [
        { id: 'pres-1', name: 'Galón' },
        { id: 'pres-2', name: 'Botella' },
      ];
      (presentationsService.findAll as unknown as jest.Mock).mockResolvedValue(
        presentations
      );

      const result = await controller.findAll();

      expect(presentationsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(presentations);
    });
  });
});
