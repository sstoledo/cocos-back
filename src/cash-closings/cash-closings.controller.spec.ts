import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { CashClosingsController } from './cash-closings.controller';
import type { CashClosingsService } from './cash-closings.service';
import type { CreateCashClosingDto } from './dto/create-cash-closing.dto';
import type { ListCashClosingsQueryDto } from './dto/list-cash-closings-query.dto';

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

const CLOSING_ROLES = [RoleName.Admin, RoleName.Reception];

describe('CashClosingsController', () => {
  let controller: CashClosingsController;
  let cashClosingsService: CashClosingsService;

  const request = {
    user: { id: 'user-1' },
  } as unknown as RequestWithUser;

  beforeEach(() => {
    jest.clearAllMocks();
    cashClosingsService = {
      close: jest.fn(),
      preview: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    } as unknown as CashClosingsService;
    controller = new CashClosingsController(cashClosingsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', CashClosingsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it.each(['close', 'preview', 'findAll', 'findOne'] as const)(
      'allows only Admin and Reception for %s',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          CashClosingsController.prototype[method],
          CashClosingsController,
        ]);
        expect(roles).toEqual(expect.arrayContaining(CLOSING_ROLES));
        expect(roles).toHaveLength(2);
      }
    );
  });

  describe('close', () => {
    it('delegates to the service with the session user id and the body', async () => {
      const dto: CreateCashClosingDto = { declaredCash: '100.00' };
      const closing = { id: 'closing-1' };
      (cashClosingsService.close as jest.Mock).mockResolvedValue(closing);

      const result = await controller.close(request, dto);

      expect(cashClosingsService.close).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(closing);
    });
  });

  describe('preview', () => {
    it('delegates to the service with the session user id', async () => {
      const preview = { salesCount: 0 };
      (cashClosingsService.preview as jest.Mock).mockResolvedValue(preview);

      const result = await controller.preview(request);

      expect(cashClosingsService.preview).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(preview);
    });
  });

  describe('findAll', () => {
    it('delegates to the service with the query dto', async () => {
      const queryDto: ListCashClosingsQueryDto = { page: 2, limit: 10 };
      const page = { data: [], meta: { page: 2, limit: 10, total: 0 } };
      (cashClosingsService.findAll as jest.Mock).mockResolvedValue(page);

      const result = await controller.findAll(queryDto);

      expect(cashClosingsService.findAll).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(page);
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the id param', async () => {
      const closing = { id: 'closing-1' };
      (cashClosingsService.findOne as jest.Mock).mockResolvedValue(closing);

      const result = await controller.findOne('closing-1');

      expect(cashClosingsService.findOne).toHaveBeenCalledWith('closing-1');
      expect(result).toEqual(closing);
    });
  });
});
