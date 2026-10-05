import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import request from 'supertest';
import { auth } from '../src/auth/auth';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersModule } from '../src/users/users.module';

jest.mock('../src/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers) => headers),
}));

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: { findUnique, findMany, count },
        role: { findUnique: jest.fn() },
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      } as unknown as PrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/users/me (GET)', () => {
    it('returns the current user with role', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        isActive: true,
        role: { id: 'role-1', name: RoleName.Admin },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'Bearer token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              id: 'user-1',
              email: 'test@example.com',
              name: 'Test User',
              isActive: true,
              role: { id: 'role-1', name: 'Admin' },
            })
          );
        });
    });
  });

  describe('/api/users (GET)', () => {
    it('returns paginated users for Admin', async () => {
      const adminSession = { user: { id: 'admin-1', roleId: 'role-admin' } };
      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(
        adminSession
      );
      findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'user@example.com',
          name: 'Target User',
          isActive: true,
          role: { id: 'role-mechanic', name: RoleName.Mechanic },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      count.mockResolvedValue(1);

      return request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              data: [
                expect.objectContaining({
                  id: 'user-1',
                  email: 'user@example.com',
                  name: 'Target User',
                  isActive: true,
                  role: { id: 'role-mechanic', name: 'Mechanic' },
                }),
              ],
              meta: { page: 1, limit: 20, total: 1 },
            })
          );
        });
    });
  });
});
