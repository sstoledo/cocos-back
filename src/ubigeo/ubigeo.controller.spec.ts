import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { UbigeoController } from './ubigeo.controller';

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

describe('UbigeoController', () => {
  let controller: UbigeoController;

  beforeEach(() => {
    controller = new UbigeoController();
  });

  it('lists ubigeos matching the query, capped by limit', () => {
    const results = controller.list({ query: 'miraflores', limit: 3 });

    expect(results).toHaveLength(3);
    expect(
      results.every((entry) => entry.district.includes('Miraflores'))
    ).toBe(true);
  });

  it('defaults to a bounded list when no query is given', () => {
    expect(controller.list({})).toHaveLength(20);
  });

  it('resolves a single code', () => {
    expect(controller.findOne('150122')).toMatchObject({
      code: '150122',
      district: 'Miraflores',
      province: 'Lima',
      department: 'Lima',
    });
  });

  it('rejects an unknown code with 404', () => {
    expect(() => controller.findOne('999999')).toThrow(NotFoundException);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', UbigeoController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();
    const allRoles = [
      RoleName.Admin,
      RoleName.Reception,
      RoleName.Mechanic,
      RoleName.Warehouse,
      RoleName.Purchasing,
      RoleName.ReadOnly,
    ];

    // Reference data: every authenticated user may read it.
    it.each(['list', 'findOne'] as const)(
      'allows all authenticated roles for %s',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          UbigeoController.prototype[method],
          UbigeoController,
        ]);
        expect(roles).toEqual(allRoles);
      }
    );
  });
});
