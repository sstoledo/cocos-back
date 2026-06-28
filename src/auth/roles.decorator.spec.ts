import { RoleName } from '@prisma/client';
import 'reflect-metadata';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles decorator', () => {
  it('sets allowed roles on the decorated method', () => {
    class TestController {
      @Roles(RoleName.Admin, RoleName.Reception)
      handler() {
        return 'ok';
      }
    }

    const instance = new TestController();
    const metadata = Reflect.getMetadata(ROLES_KEY, instance.handler);

    expect(metadata).toEqual([RoleName.Admin, RoleName.Reception]);
  });

  it('works with a single role', () => {
    class TestController {
      @Roles(RoleName.ReadOnly)
      handler() {
        return 'ok';
      }
    }

    const instance = new TestController();
    const metadata = Reflect.getMetadata(ROLES_KEY, instance.handler);

    expect(metadata).toEqual([RoleName.ReadOnly]);
  });
});
