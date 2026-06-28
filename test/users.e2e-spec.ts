import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('./../src/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers)
  ),
}));

import { auth } from './../src/auth';

const mockedGetSession = auth.api.getSession as unknown as jest.Mock;

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/api/users/me (GET) returns 401 without a session', async () => {
    mockedGetSession.mockResolvedValue(null);

    await request(app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('/api/users/me (GET) returns the user and role with a valid session', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: { id: 'role-1', name: RoleName.Reception },
    };
    mockedGetSession.mockResolvedValue({
      session: { token: 'abc' },
      user: { id: user.id },
    });
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', 'better-auth.session_token=abc')
      .expect(200);

    expect(response.body).toEqual(user);
  });
});
