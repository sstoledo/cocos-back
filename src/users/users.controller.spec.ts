import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../auth/auth', () => ({
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

import { auth } from '../auth/auth';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockedGetSession = auth.api.getSession as unknown as jest.Mock;

describe('UsersController', () => {
  let app: INestApplication;
  const mockUsersService = {
    findMe: jest.fn(),
  };
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

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

  it('GET /api/users/me returns 401 when there is no session', async () => {
    mockedGetSession.mockResolvedValue(null);

    await request(app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('GET /api/users/me returns the user and role for a valid session', async () => {
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
      role: user.role,
    });
    mockUsersService.findMe.mockResolvedValue(user);

    const response = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', 'better-auth.session_token=abc')
      .expect(200);

    expect(response.body).toEqual(user);
    expect(mockUsersService.findMe).toHaveBeenCalledWith(user.id);
  });
});
