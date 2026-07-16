import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { UploadService, UploadedImage } from '../upload';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductsService } from './products.service';

const uploadedImage: UploadedImage = {
  url: 'https://res.cloudinary.com/demo/image/upload/products/abc',
  publicId: 'products/abc',
};

const baseDto = {
  code: 'OIL-001',
  name: 'Engine oil',
  description: 'Synthetic engine oil',
  price: 30,
  isActive: true,
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

const activeWhere = { isActive: true };

const softDeleteData = { isActive: false, deletedAt: expect.any(Date) };

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let uploadService: UploadService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    uploadService = {
      uploadImage: jest.fn().mockResolvedValue(uploadedImage),
      deleteImage: jest.fn().mockResolvedValue(undefined),
    } as unknown as UploadService;
    configService = {
      get: jest.fn().mockReturnValue(cloudName),
    } as unknown as ConfigService;
    service = new ProductsService(prisma, uploadService, configService);
  });

  describe('findAll', () => {
    it('returns only active products ordered by name with relations included', async () => {
      const products = [
        {
          id: 'product-2',
          name: 'Brake pads',
          price: '50',
          ...baseRelations,
        },
        {
          id: 'product-1',
          name: 'Engine oil',
          price: '30',
          ...baseRelations,
        },
      ];
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: activeWhere,
        orderBy: { name: 'asc' },
        ...productInclude,
      });
      expect(result).toMatchObject(products);
      expect(result[0]).toBeInstanceOf(ProductResponseDto);
    });
  });

  describe('findOne', () => {
    it('returns an active product by id with relations included', async () => {
      const product = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        ...baseRelations,
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        product
      );

      const result = await service.findOne('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1', isActive: true },
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
        where: { id: 'inactive-id', isActive: true },
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
        where: { id: 'missing-id', isActive: true },
        ...productInclude,
      });
    });
  });

  describe('create', () => {
    it('creates a product without image and returns the new catalog fields', async () => {
      const dto = { ...baseDto };
      const created = {
        id: 'product-1',
        ...dto,
        price: '30',
        taxRate: '21',
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

    it('uploads image and persists image public id when image is provided', async () => {
      const dto = { ...baseDto };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      const created = {
        id: 'product-1',
        ...dto,
        price: '30',
        taxRate: '21',
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
        price: '30',
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
        where: { id: 'product-1', isActive: true },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: dto,
      });
      expect(result).toMatchObject(updated);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('uploads new image, updates record, and deletes old image', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
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
        where: { id: 'inactive-id', isActive: true },
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
        where: { id: 'missing-id', isActive: true },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('logs cleanup failure but keeps db update', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
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

  describe('remove', () => {
    it('soft-deletes an active product and keeps the image', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
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
        where: { id: 'product-1', isActive: true },
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
        where: { id: 'inactive-id', isActive: true },
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
        where: { id: 'missing-id', isActive: true },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('clears image fields and deletes the cloudinary asset', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
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
        price: '30',
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
