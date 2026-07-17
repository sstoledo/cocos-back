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

describe('Services (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const services: Array<Record<string, unknown>> = [];

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      service: {
        create: jest.fn(({ data }) => {
          if (services.some((service) => service.code === data.code)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              {
                clientVersion: '6.0.0',
                code: 'P2002',
              }
            );
          }
          const service = {
            ...data,
            id: `svc-${services.length + 1}`,
            isActive: true,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          services.push(service);
          return service;
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          let result = services.filter((service) => service.isActive);
          if (where?.OR) {
            const query = (where.OR[0] as { code: { contains: string } }).code
              .contains;
            result = result.filter(
              (service) =>
                (service.code as string)
                  .toLowerCase()
                  .includes(query.toLowerCase()) ||
                (service.name as string)
                  .toLowerCase()
                  .includes(query.toLowerCase())
            );
          }
          return result.slice(skip, skip + take);
        }),
        findUnique: jest.fn(({ where }) => {
          const found =
            services.find(
              (service) => service.id === where.id && service.isActive
            ) ?? null;
          return found;
        }),
        update: jest.fn(({ data, where }) => {
          const index = services.findIndex(
            (service) => service.id === where.id
          );
          const existing = services[index];
          if (data.code) {
            const duplicate = services.find(
              (service) => service.id !== where.id && service.code === data.code
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
          services[index] = updated;
          return updated;
        }),
        count: jest.fn(({ where }) => {
          let result = services.filter((service) => service.isActive);
          if (where?.OR) {
            const query = (where.OR[0] as { code: { contains: string } }).code
              .contains;
            result = result.filter(
              (service) =>
                (service.code as string)
                  .toLowerCase()
                  .includes(query.toLowerCase()) ||
                (service.name as string)
                  .toLowerCase()
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
        if (cookie.includes('session=admin'))
          return { user: { id: adminUser.id } };
        if (cookie.includes('session=mechanic'))
          return { user: { id: mechanicUser.id } };
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

  describe('POST /api/services', () => {
    it('creates a service and serializes price as string', async () => {
      const response = await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        description: 'Standard oil change',
        price: 25.5,
        estimatedDuration: 30,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        code: 'OIL-001',
        name: 'Oil change',
        price: '25.5',
        estimatedDuration: 30,
        isActive: true,
      });
      expect(typeof response.body.price).toBe('string');
      expect(prisma.service.create).toHaveBeenCalled();
    });

    it('returns 400 for invalid input', async () => {
      const response = await admin().post('/api/services').send({
        code: 'OIL-001',
        price: -5,
      });

      expect(response.status).toBe(400);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('returns 403 for non-admin/non-reception roles', async () => {
      const response = await mechanic().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });

      expect(response.status).toBe(403);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('returns 409 for a duplicate code', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });

      const response = await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change duplicate',
        price: 15,
      });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/services', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await anonymous().get('/api/services');

      expect(response.status).toBe(401);
    });

    it('lists active services with pagination', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });
      await admin().post('/api/services').send({
        code: 'TIRE-001',
        name: 'Tire rotation',
        price: 15,
      });

      const response = await mechanic().get('/api/services?query=oil');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: [{ code: 'OIL-001', name: 'Oil change' }],
        meta: { page: 1, limit: 10, total: 1 },
      });
    });
  });

  describe('GET /api/services/:id', () => {
    it('returns a service by id', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });

      const response = await mechanic().get('/api/services/svc-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'svc-1', code: 'OIL-001' });
    });
  });

  describe('PATCH /api/services/:id', () => {
    it('updates a service when the user is admin', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });

      const response = await admin()
        .patch('/api/services/svc-1')
        .send({ name: 'Premium oil change' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'svc-1',
        name: 'Premium oil change',
      });
    });

    it('returns 403 for a mechanic', async () => {
      const response = await mechanic()
        .patch('/api/services/svc-1')
        .send({ name: 'X' });

      expect(response.status).toBe(403);
    });

    it('returns 409 when the new code already exists', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });
      await admin().post('/api/services').send({
        code: 'TIRE-001',
        name: 'Tire rotation',
        price: 15,
      });

      const response = await admin()
        .patch('/api/services/svc-1')
        .send({ code: 'TIRE-001' });

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/services/:id', () => {
    it('soft-deletes a service when the user is admin', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });

      const response = await admin().delete('/api/services/svc-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'svc-1',
        isActive: false,
      });
      expect(response.body.deletedAt).toBeDefined();

      const getResponse = await mechanic().get('/api/services/svc-1');
      expect(getResponse.status).toBe(404);
    });

    it('returns 403 for a mechanic', async () => {
      const response = await mechanic().delete('/api/services/svc-1');

      expect(response.status).toBe(403);
    });

    it('returns 404 when the service is already deleted', async () => {
      await admin().post('/api/services').send({
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      });
      await admin().delete('/api/services/svc-1');

      const response = await admin().delete('/api/services/svc-1');

      expect(response.status).toBe(404);
    });
  });
});
