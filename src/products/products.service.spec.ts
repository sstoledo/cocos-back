import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EMBEDDING_DIMENSIONS } from '../embeddings';
import type { EmbeddingsService } from '../embeddings';
import type { PrismaService } from '../prisma/prisma.service';
import type { UploadService, UploadedImage } from '../upload';
import { ProductResponseDto } from './dto/product-response.dto';
import { ReindexEmbeddingsResponseDto } from './dto/reindex-response.dto';
import {
  ProductsService,
  composeProductDocument,
  pgVectorLiteral,
} from './products.service';

const uploadedImage: UploadedImage = {
  url: 'https://res.cloudinary.com/demo/image/upload/products/abc',
  publicId: 'products/abc',
};

const baseDto = {
  code: 'OIL-001',
  name: 'Engine oil',
  description: 'Synthetic engine oil',
  price: 30,
  presentationId: 'pres-1',
  brandId: 'brand-1',
  categoryId: 'cat-1',
  barcode: '123456789012',
  taxRate: 21,
  notes: 'Keep away from heat sources',
};

const baseRelations = {
  presentation: { id: 'pres-1', name: 'Galón' },
  brand: { id: 'brand-1', name: 'Mobil' },
  category: { id: 'cat-1', name: 'Lubricantes', parent: null },
};

const productInclude = {
  include: {
    presentation: true,
    brand: true,
    category: { include: { parent: true } },
  },
};

const cloudName = 'demo';

const softDeleteData = { isActive: false, deletedAt: expect.any(Date) };

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let uploadService: UploadService;
  let configService: ConfigService;
  let embeddingsService: EmbeddingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      lotItem: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries)
      ),
    } as unknown as PrismaService;
    uploadService = {
      uploadImage: jest.fn().mockResolvedValue(uploadedImage),
      deleteImage: jest.fn().mockResolvedValue(undefined),
    } as unknown as UploadService;
    configService = {
      get: jest.fn().mockReturnValue(cloudName),
    } as unknown as ConfigService;
    embeddingsService = {
      isConfigured: jest.fn().mockReturnValue(false),
      embedDocument: jest.fn(),
      embedQuery: jest.fn(),
      embedDocuments: jest.fn(),
    } as unknown as EmbeddingsService;
    service = new ProductsService(
      prisma,
      uploadService,
      configService,
      embeddingsService
    );
  });

  describe('findAll', () => {
    it('returns all products without isActive filter when the param is absent', async () => {
      const products = [
        {
          id: 'product-2',
          name: 'Brake pads',
          price: '50.00',
          ...baseRelations,
        },
        {
          id: 'product-1',
          name: 'Engine oil',
          price: '30.00',
          ...baseRelations,
        },
      ];
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );
      (prisma.product.count as unknown as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({});

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
        ...productInclude,
      });
      expect(result.data).toMatchObject(products);
      expect(result.data[0]).toBeInstanceOf(ProductResponseDto);
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 2 });
    });

    it('honors the isActive filter when explicitly provided', async () => {
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as unknown as jest.Mock).mockResolvedValue(0);

      await service.findAll({ isActive: false });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } })
      );

      await service.findAll({ isActive: true });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });

    it('applies the presentationId filter when provided', async () => {
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as unknown as jest.Mock).mockResolvedValue(0);

      await service.findAll({ presentationId: 'pres-1' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { presentationId: 'pres-1' } })
      );
    });

    it('maps aggregated stock per product and defaults to 0 without lot items', async () => {
      const products = [
        {
          id: 'product-1',
          name: 'Engine oil',
          price: '30.00',
          ...baseRelations,
        },
        {
          id: 'product-2',
          name: 'Brake pads',
          price: '50.00',
          ...baseRelations,
        },
      ];
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );
      (prisma.product.count as unknown as jest.Mock).mockResolvedValue(2);
      (prisma.lotItem.groupBy as unknown as jest.Mock).mockResolvedValue([
        { productId: 'product-1', _sum: { remainingQuantity: 7 } },
      ]);

      const result = await service.findAll({});

      expect(prisma.lotItem.groupBy).toHaveBeenCalledWith({
        by: ['productId'],
        where: { productId: { in: ['product-1', 'product-2'] } },
        _sum: { remainingQuantity: true },
      });
      expect(result.data[0].stock).toBe(7);
      expect(result.data[1].stock).toBe(0);
    });

    it('skips the stock aggregation when the page is empty', async () => {
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as unknown as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll({});

      expect(prisma.lotItem.groupBy).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns an active product by id with relations included', async () => {
      const product = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        ...baseRelations,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        product
      );

      const result = await service.findOne('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        ...productInclude,
      });
      expect(result).toMatchObject(product);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product is soft-deleted', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('inactive-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'inactive-id' },
        ...productInclude,
      });
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'missing-id' },
        ...productInclude,
      });
    });
  });

  describe('semantic embedding helpers', () => {
    it('composes deterministic document content from catalog fields', () => {
      expect(
        composeProductDocument({
          name: 'Engine oil',
          description: 'Synthetic engine oil',
          code: 'OIL-001',
          brand: { name: 'Mobil' },
          category: { name: 'Lubricantes' },
        })
      ).toBe(
        'Synthetic engine oil\ncode: OIL-001\nmeta brand: Mobil\nmeta category: Lubricantes'
      );
    });

    it('formats vectors as pgvector text literals', () => {
      expect(pgVectorLiteral([1, 2.5, -3])).toBe('[1,2.5,-3]');
    });
  });

  describe('searchSemantic', () => {
    it('embeds the query, searches by cosine distance, and preserves rank order', async () => {
      const values = Array.from(
        { length: EMBEDDING_DIMENSIONS },
        (_, index) => index / EMBEDDING_DIMENSIONS
      );
      const vectorText = pgVectorLiteral(values);
      const products = [
        {
          id: 'product-1',
          name: 'Engine oil',
          code: 'OIL-001',
          price: '30.00',
          ...baseRelations,
        },
        {
          id: 'product-2',
          name: 'Oil filter',
          code: 'FILTER-001',
          price: '12.00',
          ...baseRelations,
        },
      ];
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedQuery as jest.Mock).mockResolvedValue(values);
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([
        { id: 'product-2' },
        { id: 'product-1' },
      ]);
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );

      const result = await service.searchSemantic({
        q: 'pico y espiga',
        limit: 2,
        isActive: true,
      });

      expect(embeddingsService.embedQuery).toHaveBeenCalledWith(
        'pico y espiga'
      );
      const rawCall = (prisma.$queryRaw as unknown as jest.Mock).mock.calls[0];
      expect(rawCall[0].join('')).toContain('embedding <=>');
      expect(rawCall[0].join('')).toContain('"is_active" =');
      expect(rawCall.slice(1)).toEqual([true, vectorText, vectorText, 2]);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['product-2', 'product-1'] } },
        ...productInclude,
      });
      expect(result.data.map((product) => product.id)).toEqual([
        'product-2',
        'product-1',
      ]);
      expect(result.data[0]).toBeInstanceOf(ProductResponseDto);
    });

    it('throws 503 with the business error code when embeddings are not configured', async () => {
      await expect(
        service.searchSemantic({ q: 'engine oil' })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMBEDDINGS_NOT_CONFIGURED' },
        status: 503,
      });
      expect(embeddingsService.embedQuery).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns an empty data envelope without hydrating when there are no matches', async () => {
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedQuery as jest.Mock).mockResolvedValue(
        Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)
      );
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([]);

      await expect(
        service.searchSemantic({ q: 'missing product' })
      ).resolves.toEqual({ data: [] });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
      const rawCall = (prisma.$queryRaw as unknown as jest.Mock).mock.calls[0];
      expect(rawCall[1]).toBe(true);
      expect(rawCall[4]).toBe(10);
    });

    it('supports explicitly searching inactive products', async () => {
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedQuery as jest.Mock).mockResolvedValue(
        Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)
      );
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([]);

      await service.searchSemantic({ q: 'archived oil', isActive: false });

      expect((prisma.$queryRaw as unknown as jest.Mock).mock.calls[0][1]).toBe(
        false
      );
    });
  });

  describe('create', () => {
    it('creates a product without image and returns the new catalog fields', async () => {
      const dto = { ...baseDto };
      const created = {
        id: 'product-1',
        ...dto,
        price: '30.00',
        taxRate: '21.00',
        ...baseRelations,
      };
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto as never);

      expect(uploadService.uploadImage).not.toHaveBeenCalled();
      expect(prisma.product.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject(created);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('backfills the embedding after a successful create', async () => {
      const dto = { ...baseDto };
      const created = {
        id: 'product-1',
        ...dto,
        price: '30.00',
        taxRate: '21.00',
        ...baseRelations,
      };
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedDocument as jest.Mock).mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto as never);

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        ...productInclude,
      });
      expect(embeddingsService.embedDocument).toHaveBeenCalledWith(
        'Engine oil',
        'Synthetic engine oil\ncode: OIL-001\nmeta brand: Mobil\nmeta category: Lubricantes'
      );
      const rawCall = (prisma.$executeRaw as unknown as jest.Mock).mock
        .calls[0];
      expect(rawCall[0].join(' ').replace(/\s+/g, ' ')).toContain(
        'UPDATE "products" SET embedding'
      );
      expect(rawCall.slice(1)).toEqual(['[0.1,0.2,0.3]', 'product-1']);
      expect(result.id).toBe('product-1');
    });

    it('keeps create successful when embedding generation fails', async () => {
      const dto = { ...baseDto };
      const created = {
        id: 'product-1',
        ...dto,
        price: '30.00',
        taxRate: '21.00',
        ...baseRelations,
      };
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedDocument as jest.Mock).mockRejectedValue(
        new Error('provider unavailable')
      );
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        created
      );
      const loggerSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.create(dto as never);

      expect(result.id).toBe('product-1');
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it('uploads image and persists image public id when image is provided', async () => {
      const dto = { ...baseDto };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      const created = {
        id: 'product-1',
        ...dto,
        price: '30.00',
        taxRate: '21.00',
        imagePublicId: uploadedImage.publicId,
        ...baseRelations,
      };
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto as never, image);

      expect(uploadService.uploadImage).toHaveBeenCalledWith(
        image.buffer,
        'products'
      );
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          imagePublicId: uploadedImage.publicId,
        },
      });
      expect(result).toMatchObject({
        ...created,
        imageUrl: `https://res.cloudinary.com/${cloudName}/image/upload/${uploadedImage.publicId}`,
      });
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws ConflictException when code already exists', async () => {
      const dto = { ...baseDto };
      (prisma.product.create as unknown as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      await expect(service.create(dto as never)).rejects.toThrow(
        ConflictException
      );
    });

    it('propagates upload errors', async () => {
      const dto = { ...baseDto };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockRejectedValue(
        new Error('upload failed')
      );

      await expect(service.create(dto as never, image)).rejects.toThrow(
        'upload failed'
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates fields without image when product is active', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        ...baseRelations,
      };
      const dto = { name: 'Engine oil premium', brandId: 'brand-2' };
      const updated = { ...existing, ...dto };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('product-1', dto as never);

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: dto,
      });
      expect(result).toMatchObject(updated);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('re-embeds only after embedding-relevant fields change', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        description: 'Old description',
        code: 'OIL-001',
        brandId: 'brand-1',
        categoryId: 'cat-1',
        price: '30.00',
        ...baseRelations,
      };
      const dto = { description: 'New description' };
      const updated = { ...existing, ...dto };
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedDocument as jest.Mock).mockResolvedValue([
        0.1, 0.2,
      ]);
      (prisma.product.findUnique as unknown as jest.Mock)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('product-1', dto as never);

      expect(embeddingsService.embedDocument).toHaveBeenCalledWith(
        'Engine oil',
        'New description\ncode: OIL-001\nmeta brand: Mobil\nmeta category: Lubricantes'
      );
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toMatchObject(updated);
    });

    it('does not re-embed for identical or non-semantic field values', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        description: 'Synthetic engine oil',
        code: 'OIL-001',
        brandId: 'brand-1',
        categoryId: 'cat-1',
        isActive: true,
        price: '30.00',
        ...baseRelations,
      };
      const dto = { name: 'Engine oil', isActive: false };
      const updated = { ...existing, ...dto };
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      await service.update('product-1', dto as never);

      expect(embeddingsService.embedDocument).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
    });

    it('keeps update successful when re-embedding fails', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        description: 'Old description',
        code: 'OIL-001',
        price: '30.00',
        ...baseRelations,
      };
      const dto = { name: 'Premium engine oil' };
      const updated = { ...existing, ...dto };
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (embeddingsService.embedDocument as jest.Mock).mockRejectedValue(
        new Error('provider unavailable')
      );
      (prisma.product.findUnique as unknown as jest.Mock)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );
      const loggerSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.update('product-1', dto as never);

      expect(result).toMatchObject(updated);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it('uploads new image, updates record, and deletes old image', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        imagePublicId: 'products/old',
        ...baseRelations,
      };
      const image = { buffer: Buffer.from('new-image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      const updated = {
        ...existing,
        imagePublicId: uploadedImage.publicId,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('product-1', {} as never, image);

      expect(uploadService.uploadImage).toHaveBeenCalledWith(
        image.buffer,
        'products'
      );
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: {
          imagePublicId: uploadedImage.publicId,
        },
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(result).toMatchObject({
        ...updated,
        imageUrl: `https://res.cloudinary.com/${cloudName}/image/upload/${uploadedImage.publicId}`,
      });
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product is soft-deleted', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('inactive-id', {} as never)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'inactive-id' },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('missing-id', {} as never)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'missing-id' },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('logs cleanup failure but keeps db update', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        imagePublicId: 'products/old',
        ...baseRelations,
      };
      const image = { buffer: Buffer.from('new-image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      (uploadService.deleteImage as unknown as jest.Mock).mockRejectedValue(
        new Error('delete failed')
      );
      const updated = {
        ...existing,
        imagePublicId: uploadedImage.publicId,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );
      const loggerSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.update('product-1', {} as never, image);

      expect(result).toMatchObject({
        ...updated,
        imageUrl: `https://res.cloudinary.com/${cloudName}/image/upload/${uploadedImage.publicId}`,
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });
  });

  describe('reindexEmbeddings', () => {
    it('backfills only missing embeddings in transactional batches', async () => {
      const products = [
        {
          id: 'product-1',
          name: 'Engine oil',
          description: 'Synthetic engine oil',
          code: 'OIL-001',
          price: '30.00',
          ...baseRelations,
        },
        {
          id: 'product-2',
          name: 'Oil filter',
          description: null,
          code: 'FILTER-001',
          price: '12.00',
          ...baseRelations,
        },
      ];
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue(
        products.map(({ id }) => ({ id }))
      );
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );
      (embeddingsService.embedDocuments as jest.Mock).mockResolvedValue([
        { id: 'product-1', values: [0.1, 0.2] },
        { id: 'product-2', values: [0.3, 0.4] },
      ]);

      const result = await service.reindexEmbeddings();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['product-1', 'product-2'] } },
        ...productInclude,
      });
      expect(embeddingsService.embedDocuments).toHaveBeenCalledWith([
        {
          id: 'product-1',
          title: 'Engine oil',
          content:
            'Synthetic engine oil\ncode: OIL-001\nmeta brand: Mobil\nmeta category: Lubricantes',
        },
        {
          id: 'product-2',
          title: 'Oil filter',
          content:
            '\ncode: FILTER-001\nmeta brand: Mobil\nmeta category: Lubricantes',
        },
      ]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ updated: 2, failed: 0, totalMissing: 2 });
      expect(result).toBeInstanceOf(ReindexEmbeddingsResponseDto);
    });

    it('reports failed rows without aborting the reindex response', async () => {
      const products = [
        {
          id: 'product-1',
          name: 'Engine oil',
          description: null,
          code: 'OIL-001',
          price: '30.00',
          ...baseRelations,
        },
      ];
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([
        { id: 'product-1' },
      ]);
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );
      (embeddingsService.embedDocuments as jest.Mock).mockRejectedValue(
        new Error('provider unavailable')
      );
      const loggerSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.reindexEmbeddings();

      expect(result).toMatchObject({ updated: 0, failed: 1, totalMissing: 1 });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it('returns zeros when no embeddings are missing', async () => {
      (embeddingsService.isConfigured as jest.Mock).mockReturnValue(true);
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([]);

      const result = await service.reindexEmbeddings();

      expect(result).toMatchObject({ updated: 0, failed: 0, totalMissing: 0 });
      expect(embeddingsService.embedDocuments).not.toHaveBeenCalled();
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when embeddings are not configured', async () => {
      await expect(service.reindexEmbeddings()).rejects.toThrow(
        ServiceUnavailableException
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes an active product and keeps the image', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        imagePublicId: 'products/old',
        ...baseRelations,
      };
      const updated = { ...existing, ...softDeleteData };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.remove('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: softDeleteData,
      });
      expect(uploadService.deleteImage).not.toHaveBeenCalled();
      expect(result).toMatchObject(updated);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product is already soft-deleted', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('inactive-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'inactive-id' },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'missing-id' },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('clears image fields and deletes the cloudinary asset', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        imagePublicId: 'products/old',
        ...baseRelations,
      };
      const updated = {
        ...existing,
        imagePublicId: null,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.removeImage('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { imagePublicId: null },
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(result).toMatchObject(updated);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.removeImage('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('logs cleanup failure but keeps db update', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30.00',
        imagePublicId: 'products/old',
        ...baseRelations,
      };
      const updated = {
        ...existing,
        imagePublicId: null,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );
      (uploadService.deleteImage as unknown as jest.Mock).mockRejectedValue(
        new Error('delete failed')
      );
      const loggerSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.removeImage('product-1');

      expect(result).toMatchObject(updated);
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });
  });
});
