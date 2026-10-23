import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { CreateProformaDto } from './dto/create-proforma.dto';
import type { ListProformasQueryDto } from './dto/list-proformas-query.dto';
import { ProformasController } from './proformas.controller';
import type { ProformasService } from './proformas.service';

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

describe('ProformasController', () => {
  let controller: ProformasController;
  let proformasService: ProformasService;

  beforeEach(() => {
    jest.clearAllMocks();
    proformasService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as ProformasService;
    controller = new ProformasController(proformasService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', ProformasController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();
    const expectedRoles = [RoleName.Admin, RoleName.Reception];

    it.each([
      'create',
      'findAll',
      'findOne',
      'update',
      'updateStatus',
    ] as const)(
      'restricts %s to Admin and Reception (Mechanic 403)',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          ProformasController.prototype[method],
          ProformasController,
        ]);
        expect(roles).toEqual(expectedRoles);
      }
    );
  });

  describe('create', () => {
    it('delegates to the service with the DTO', async () => {
      const dto = {
        productLines: [{ productId: 'prod-1', quantity: 1 }],
      } as CreateProformaDto;
      (proformasService.create as jest.Mock).mockResolvedValue({
        id: 'prof-1',
      });

      const result = await controller.create(dto);

      expect(proformasService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'prof-1' });
    });
  });

  describe('findAll', () => {
    it('delegates to the service with the query DTO', async () => {
      const query = { page: 2, limit: 5 } as ListProformasQueryDto;
      (proformasService.findAll as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });

      const result = await controller.findAll(query);

      expect(proformasService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the id', async () => {
      (proformasService.findOne as jest.Mock).mockResolvedValue({
        id: 'prof-1',
      });

      const result = await controller.findOne('prof-1');

      expect(proformasService.findOne).toHaveBeenCalledWith('prof-1');
      expect(result).toEqual({ id: 'prof-1' });
    });
  });

  describe('update', () => {
    it('delegates to the service with id and DTO', async () => {
      (proformasService.update as jest.Mock).mockResolvedValue({
        id: 'prof-1',
      });

      const result = await controller.update('prof-1', { notes: 'n' });

      expect(proformasService.update).toHaveBeenCalledWith('prof-1', {
        notes: 'n',
      });
      expect(result).toEqual({ id: 'prof-1' });
    });
  });

  describe('updateStatus', () => {
    it('delegates to the service with id and DTO', async () => {
      (proformasService.updateStatus as jest.Mock).mockResolvedValue({
        id: 'prof-1',
        status: 'sent',
      });

      const result = await controller.updateStatus('prof-1', {
        status: 'sent',
      });

      expect(proformasService.updateStatus).toHaveBeenCalledWith('prof-1', {
        status: 'sent',
      });
      expect(result).toEqual({ id: 'prof-1', status: 'sent' });
    });
  });
});
