import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { auth } from './../src/auth/auth';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('../src/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(() => ({ provider: 'postgresql' })),
}));

jest.mock('better-auth/node', () => ({
  toNodeHandler: jest.fn(() => jest.fn()),
  fromNodeHeaders: jest.fn((headers) => headers),
}));

describe('Users (e2e)', () => {
  let app: INestApplication;
  const findUnique = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: { findUnique },
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

  it('/api/users/me (GET) returns the current user with role', async () => {
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
    });
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: { id: 'role-1', name: RoleName.Admin },
    });

    return request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect({
        id: 'user-1',
        email: 'test@example.com',
        role: { id: 'role-1', name: 'Admin' },
      });
  });
});
