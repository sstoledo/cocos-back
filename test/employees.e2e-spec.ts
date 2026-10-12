import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { auth } from './../src/auth/auth';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('better-auth', () => ({
  betterAuth: jest.fn(() => ({
    api: { getSession: jest.fn() },
  })),
}));

jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(() => ({ provider: 'postgresql' })),
}));

jest.mock('better-auth/node', () => ({
  toNodeHandler: jest.fn(() => jest.fn()),
  fromNodeHeaders: jest.fn((headers) => headers),
}));

const users = [
  { id: 'user-admin', role: { name: RoleName.Admin } },
  { id: 'user-reception', role: { name: RoleName.Reception } },
  { id: 'user-mechanic', role: { name: RoleName.Mechanic } },
];

type Row = Record<string, unknown>;

describe('Employees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let employees: Array<Row>;

  beforeEach(async () => {
    jest.clearAllMocks();

    employees = [
      {
        id: 'emp-2',
        name: 'Juan López',
        specialty: 'Electricidad',
        userId: 'user-2',
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'emp-1',
        name: 'Ana Pérez',
        specialty: 'Mecánica',
        userId: null,
        isActive: true,
        deletedAt: null,
      },
      {
        id: 'emp-3',
        name: 'Pedro Inactivo',
        specialty: null,
        userId: null,
        isActive: false,
        deletedAt: null,
      },
      {
        id: 'emp-4',
        name: 'María Borrada',
        specialty: null,
        userId: null,
        isActive: true,
        deletedAt: new Date(),
      },
    ];

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      user: {
        findUnique: jest.fn(({ where }) => {
          return users.find((user) => user.id === where.id) ?? null;
        }),
      },
      employee: {
        findMany: jest.fn(({ where, select, orderBy }) => {
          const matches = employees
            .filter(
              (employee) =>
                employee.isActive === where.isActive &&
                employee.deletedAt === where.deletedAt
            )
            .sort((a, b) =>
              orderBy.name === 'asc'
                ? String(a.name).localeCompare(String(b.name))
                : String(b.name).localeCompare(String(a.name))
            );
          return matches.map((employee) => {
            const picked: Row = {};
            for (const field of Object.keys(select)) {
              picked[field] = employee[field];
            }
            return picked;
          });
        }),
      },
    } as unknown as PrismaService;

    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
      ({ headers }: { headers?: Record<string, string> }) => {
        const cookie = headers?.cookie ?? '';
        const matched = users.find((user) =>
          cookie.includes(`session=${user.id.replace('user-', '')}`)
        );
        return matched ? { user: { id: matched.id } } : null;
      }
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const agent = (session: string) =>
    request.agent(app.getHttpServer()).set('Cookie', `session=${session}`);
  const admin = () => agent('admin');
  const reception = () => agent('reception');
  const mechanic = () => agent('mechanic');
  const anonymous = () => request.agent(app.getHttpServer());

  describe('GET /api/employees', () => {
    it('returns 401 for anonymous', async () => {
      expect((await anonymous().get('/api/employees')).status).toBe(401);
    });

    it('returns 403 for roles without access', async () => {
      expect((await mechanic().get('/api/employees')).status).toBe(403);
    });

    it('returns only active, non-deleted employees ordered by name with select fields', async () => {
      const response = await admin().get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 'emp-1', name: 'Ana Pérez', specialty: 'Mecánica', userId: null },
        {
          id: 'emp-2',
          name: 'Juan López',
          specialty: 'Electricidad',
          userId: 'user-2',
        },
      ]);
    });

    it('is accessible by Reception', async () => {
      const response = await reception().get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });
});
