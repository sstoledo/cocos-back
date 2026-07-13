import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Prisma, RoleName } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { auth } from './../src/auth/auth';
import { PrismaService } from './../src/prisma/prisma.service';
import { UploadService } from './../src/upload/upload.service';

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

const uploadedImage = {
  url: 'https://res.cloudinary.example.com/products/fake.jpg',
  publicId: 'products/fake-123',
};

const cloudName = 'your_cloud_name';
const derivedImageUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${uploadedImage.publicId}`;

const catalogIds = {
  presentationId: 'presentation-1',
  brandId: 'brand-1',
  categoryId: 'category-1',
};

const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const oversizedPng = Buffer.concat([
  imagePng,
  Buffer.alloc(2 * 1024 * 1024 + 1 - imagePng.length),
]);

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let uploadService: UploadService;

  beforeEach(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = cloudName;
    jest.clearAllMocks();

    const products: Array<Record<string, unknown>> = [];

    uploadService = {
      deleteImage: jest.fn().mockResolvedValue(undefined),
      uploadImage: jest.fn().mockResolvedValue(uploadedImage),
    } as unknown as UploadService;

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      product: {
        create: jest.fn(({ data }) => {
          if (products.some((product) => product.code === data.code)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              {
                clientVersion: '6.0.0',
                code: 'P2002',
              }
            );
          }
          const product = {
            ...data,
            id: `product-${products.length + 1}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            presentation: { id: data.presentationId, name: 'Presentation' },
            brand: { id: data.brandId, name: 'Brand' },
            category: { id: data.categoryId, name: 'Category', parent: null },
          };
          products.push(product);
          return product;
        }),
        delete: jest.fn(({ where }) => {
          const index = products.findIndex(
            (product) => product.id === where.id
          );
          const existing = products[index];
          const product = {
            ...existing,
            presentation: existing.presentation || {
              id: existing.presentationId,
              name: 'Presentation',
            },
            brand: existing.brand || {
              id: existing.brandId,
              name: 'Brand',
            },
            category: existing.category || {
              id: existing.categoryId,
              name: 'Category',
              parent: null,
            },
          };
          products.splice(index, 1);
          return product;
        }),
        findMany: jest.fn().mockResolvedValue(products),
        findUnique: jest.fn(({ where }) => {
          let found = null;
          if (where.id) {
            found = products.find((product) => product.id === where.id) ?? null;
          }
          if (where.code) {
            found =
              products.find((product) => product.code === where.code) ?? null;
          }
          if (!found) return null;
          return {
            ...found,
            presentation: found.presentation || {
              id: found.presentationId,
              name: 'Presentation',
            },
            brand: found.brand || {
              id: found.brandId,
              name: 'Brand',
            },
            category: found.category || {
              id: found.categoryId,
              name: 'Category',
              parent: null,
            },
          };
        }),
        update: jest.fn(({ data, where }) => {
          const index = products.findIndex(
            (product) => product.id === where.id
          );
          const existing = products[index];
          const updated = {
            ...existing,
            ...data,
            presentation: {
              id: data.presentationId || existing.presentationId,
              name: 'Presentation',
            },
            brand: {
              id: data.brandId || existing.brandId,
              name: 'Brand',
            },
            category: {
              id: data.categoryId || existing.categoryId,
              name: 'Category',
              parent: null,
            },
          };
          products[index] = updated;
          return updated;
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
      .overrideProvider(UploadService)
      .useValue(uploadService)
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

  describe('POST /api/products', () => {
    it('creates a product with an image when the user is admin', async () => {
      const response = await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        code: 'OIL-001',
        imagePublicId: uploadedImage.publicId,
        imageUrl: derivedImageUrl,
        name: 'Engine oil',
        price: '30',
      });
      expect(typeof response.body.price).toBe('string');
      expect(uploadService.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'products'
      );
      expect(prisma.product.create).toHaveBeenCalled();
    });

    it('returns 403 when the user is not an admin', async () => {
      const response = await mechanic()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      expect(response.status).toBe(403);
      expect(prisma.product.create).not.toHaveBeenCalled();
      expect(uploadService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 400 when the image is larger than 2 MB', async () => {
      const response = await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', oversizedPng, 'image.png');

      expect(response.status).toBe(400);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('returns 400 when the file is not an image', async () => {
      const response = await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', Buffer.from('not an image'), 'file.txt');

      expect(response.status).toBe(400);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('returns 409 when the product code already exists', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId);

      const response = await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil duplicate')
        .field('price', '25')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId);

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/products', () => {
    it('returns 401 when the caller is not authenticated', async () => {
      const response = await anonymous().get('/api/products');

      expect(response.status).toBe(401);
    });

    it('lists products with query parameters', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId);
      await admin()
        .post('/api/products')
        .field('code', 'BRAKE-001')
        .field('name', 'Brake pads')
        .field('price', '50')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId);

      const response = await admin().get('/api/products?q=oil&isActive=true');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a product by id', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId);

      const response = await admin().get('/api/products/product-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        code: 'OIL-001',
        id: 'product-1',
        name: 'Engine oil',
      });
    });
  });

  describe('PATCH /api/products/:id', () => {
    it('updates a product and replaces its image', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      const response = await admin()
        .patch('/api/products/product-1')
        .field('name', 'Engine oil premium')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        imagePublicId: uploadedImage.publicId,
        imageUrl: derivedImageUrl,
        name: 'Engine oil premium',
      });
      expect(uploadService.uploadImage).toHaveBeenCalledTimes(2);
      expect(uploadService.deleteImage).toHaveBeenCalledWith(
        'products/fake-123'
      );
    });
  });

  describe('DELETE /api/products/:id/image', () => {
    it('removes the product image and deletes the Cloudinary asset', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      const response = await admin().delete('/api/products/product-1/image');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        imagePublicId: null,
        imageUrl: null,
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith(
        'products/fake-123'
      );
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('deletes the product and schedules image cleanup', async () => {
      await admin()
        .post('/api/products')
        .field('code', 'OIL-001')
        .field('name', 'Engine oil')
        .field('price', '30')
        .field('presentationId', catalogIds.presentationId)
        .field('brandId', catalogIds.brandId)
        .field('categoryId', catalogIds.categoryId)
        .attach('image', imagePng, 'image.png');

      const response = await admin().delete('/api/products/product-1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('product-1');
      expect(uploadService.deleteImage).toHaveBeenCalledWith(
        'products/fake-123'
      );
    });
  });
});
