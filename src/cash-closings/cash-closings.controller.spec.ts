import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { RequestWithUser } from '../auth';
import { CashClosingsController } from './cash-closings.controller';
import type { CashClosingsService } from './cash-closings.service';
import type { CreateCashClosingDto } from './dto/create-cash-closing.dto';

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

    it.each(['close', 'preview'] as const)(
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
});
