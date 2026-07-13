import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Prisma, RoleName } from '@prisma/client';
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

const adminUser = { id: 'user-admin', role: { name: RoleName.Admin } };
const mechanicUser = { id: 'user-mechanic', role: { name: RoleName.Mechanic } };

describe('Clients (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const clients: Array<Record<string, unknown>> = [];

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      client: {
        create: jest.fn(({ data }) => {
          const duplicate = clients.find(
            (client) =>
              client.identification &&
              client.identification === data.identification
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              {
                clientVersion: '6.0.0',
                code: 'P2002',
              }
            );
          }
          const client = {
            ...data,
            id: `client-${clients.length + 1}`,
            isActive: true,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          clients.push(client);
          return client;
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          let result = clients.filter((client) => client.isActive !== false);
          if (where?.OR) {
            const query = (where.OR[0] as { name: { contains: string } }).name
              .contains;
            result = result.filter(
              (client) =>
                (client.name as string)
                  .toLowerCase()
                  .includes(query.toLowerCase()) ||
                (client.identification as string | undefined)
                  ?.toLowerCase()
                  .includes(query.toLowerCase())
            );
          }
          return result.slice(skip, skip + take);
        }),
        findUnique: jest.fn(({ where }) => {
          let found = null;
          if (where.id) {
            found =
              clients.find(
                (client) => client.id === where.id && client.isActive
              ) ?? null;
          }
          return found;
        }),
        update: jest.fn(({ data, where }) => {
          const index = clients.findIndex((client) => client.id === where.id);
          const existing = clients[index];
          if (data.identification) {
            const duplicate = clients.find(
              (client) =>
                client.id !== where.id &&
                client.identification === data.identification
            );
            if (duplicate) {
              throw new Prisma.PrismaClientKnownRequestError(
                'unique constraint',
                {
                  clientVersion: '6.0.0',
                  code: 'P2002',
                }
              );
            }
          }
          const updated = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString(),
          };
          clients[index] = updated;
          return updated;
        }),
        count: jest.fn(({ where }) => {
          let result = clients.filter((client) => client.isActive !== false);
          if (where?.OR) {
            const query = (where.OR[0] as { name: { contains: string } }).name
              .contains;
            result = result.filter(
              (client) =>
                (client.name as string)
                  .toLowerCase()
                  .includes(query.toLowerCase()) ||
                (client.identification as string | undefined)
                  ?.toLowerCase()
                  .includes(query.toLowerCase())
            );
          }
          return result.length;
        }),
      },
      user: {
        findUnique: jest.fn(({ where }) => {
          if (where.id === adminUser.id) return adminUser;
          if (where.id === mechanicUser.id) return mechanicUser;
          return null;
        }),
      },
    } as unknown as PrismaService;

    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
      ({ headers }: { headers?: Record<string, string> }) => {
        const cookie = headers?.cookie ?? '';
        if (cookie.includes('session=admin')) {
          return { user: { id: adminUser.id } };
        }
        if (cookie.includes('session=mechanic')) {
          return { user: { id: mechanicUser.id } };
        }
        return null;
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

  const admin = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=admin');
  const anonymous = () => request.agent(app.getHttpServer());
  const mechanic = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=mechanic');

  describe('POST /api/clients', () => {
    it('creates a client with valid DNI when the user is admin', async () => {
      const response = await admin().post('/api/clients').send({
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      });
      expect(prisma.client.create).toHaveBeenCalled();
    });

    it('returns 400 for invalid DNI', async () => {
      const response = await admin().post('/api/clients').send({
        name: 'Juan Pérez',
        identification: '123',
        identificationType: 'DNI',
      });

      expect(response.status).toBe(400);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('returns 403 when the user is a mechanic', async () => {
      const response = await mechanic().post('/api/clients').send({
        name: 'Juan Pérez',
      });

      expect(response.status).toBe(403);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('returns 409 for duplicate identification', async () => {
      await admin().post('/api/clients').send({
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      });

      const response = await admin().post('/api/clients').send({
        name: 'Ana López',
        identification: '12345678',
        identificationType: 'DNI',
      });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/clients', () => {
    it('returns 401 when the caller is not authenticated', async () => {
      const response = await anonymous().get('/api/clients');

      expect(response.status).toBe(401);
    });

    it('lists active clients with search and pagination', async () => {
      await admin().post('/api/clients').send({ name: 'Juan Pérez' });
      await admin().post('/api/clients').send({ name: 'Ana López' });

      const response = await mechanic().get('/api/clients?query=juan');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: [{ name: 'Juan Pérez' }],
        meta: { page: 1, limit: 10, total: 1 },
      });
    });
  });

  describe('GET /api/clients/:id', () => {
    it('returns a client by id', async () => {
      await admin().post('/api/clients').send({ name: 'Juan Pérez' });

      const response = await mechanic().get('/api/clients/client-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'client-1',
        name: 'Juan Pérez',
      });
    });
  });

  describe('PATCH /api/clients/:id', () => {
    it('updates a client when the user is admin', async () => {
      await admin().post('/api/clients').send({ name: 'Juan Pérez' });

      const response = await admin()
        .patch('/api/clients/client-1')
        .send({ name: 'Juan Pérez Actualizado' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'client-1',
        name: 'Juan Pérez Actualizado',
      });
    });

    it('returns 403 when the user is a mechanic', async () => {
      const response = await mechanic()
        .patch('/api/clients/client-1')
        .send({ name: 'X' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/clients/:id', () => {
    it('soft-deletes a client when the user is admin', async () => {
      await admin().post('/api/clients').send({ name: 'Juan Pérez' });

      const response = await admin().delete('/api/clients/client-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'client-1',
        isActive: false,
      });
      expect(response.body.deletedAt).toBeDefined();
    });

    it('returns 403 when the user is a mechanic', async () => {
      const response = await mechanic().delete('/api/clients/client-1');

      expect(response.status).toBe(403);
    });
  });
});
