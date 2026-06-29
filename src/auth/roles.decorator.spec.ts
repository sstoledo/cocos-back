import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles', () => {
  const reflector = new Reflector();

  it('stores the allowed role names under ROLES_KEY', () => {
    class TestController {
      @Roles(RoleName.Admin, RoleName.Mechanic)
      handler() {}
    }

    const metadata = reflector.get(ROLES_KEY, TestController.prototype.handler);

    expect(metadata).toEqual(['Admin', 'Mechanic']);
  });
});
