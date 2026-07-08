import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { plainToInstance } from 'class-transformer';
import type { PrismaService } from '../prisma/prisma.service';
import type { UploadService, UploadedImage } from '../upload';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductsService } from './products.service';

const uploadedImage: UploadedImage = {
  url: 'https://res.cloudinary.com/demo/image/upload/products/abc',
  publicId: 'products/abc',
};

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let uploadService: UploadService;

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
    service = new ProductsService(prisma, uploadService);
  });

  describe('findAll', () => {
    it('returns all products ordered by name ascending with price as a string', async () => {
      const products = [
        { id: 'product-2', name: 'Brake pads', price: '50' },
        { id: 'product-1', name: 'Engine oil', price: '30' },
      ];
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toMatchObject(products);
    });
  });

  describe('findOne', () => {
    it('returns a product by id with price as a string', async () => {
      const product = { id: 'product-1', name: 'Engine oil', price: '30' };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        product
      );

      const result = await service.findOne('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(result).toMatchObject(product);
    });
  });

  describe('create', () => {
    it('creates a product without image and returns price as a string', async () => {
      const dto = {
        code: 'OIL-001',
        name: 'Engine oil',
        description: 'Synthetic engine oil',
        price: 30,
        minStock: 10,
        unit: 'liter',
        isActive: true,
      };
      const created = { id: 'product-1', ...dto, price: '30' };
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto as never);

      expect(uploadService.uploadImage).not.toHaveBeenCalled();
      expect(prisma.product.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject(created);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('uploads image and persists image fields when image is provided', async () => {
      const dto = {
        code: 'OIL-001',
        name: 'Engine oil',
        price: 30,
      };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      const created = {
        id: 'product-1',
        ...dto,
        price: '30',
        imageUrl: uploadedImage.url,
        imagePublicId: uploadedImage.publicId,
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
          imageUrl: uploadedImage.url,
          imagePublicId: uploadedImage.publicId,
        },
      });
      expect(result).toMatchObject(created);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws ConflictException when code already exists', async () => {
      const dto = {
        code: 'OIL-001',
        name: 'Engine oil',
        price: 30,
      };
      (prisma.product.create as unknown as jest.Mock).mockRejectedValue(
        new PrismaClientKnownRequestError('unique constraint', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      await expect(service.create(dto as never)).rejects.toThrow(
        ConflictException
      );
    });

    it('propagates upload errors', async () => {
      const dto = { code: 'OIL-001', name: 'Engine oil', price: 30 };
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
    it('updates fields without image', async () => {
      const existing = { id: 'product-1', name: 'Engine oil', price: '30' };
      const dto = { name: 'Engine oil premium' };
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

    it('uploads new image, updates record, and deletes old image', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
      };
      const image = { buffer: Buffer.from('new-image') } as Express.Multer.File;
      (uploadService.uploadImage as unknown as jest.Mock).mockResolvedValue(
        uploadedImage
      );
      const updated = {
        ...existing,
        imageUrl: uploadedImage.url,
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
          imageUrl: uploadedImage.url,
          imagePublicId: uploadedImage.publicId,
        },
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(result).toMatchObject(updated);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('missing-id', {} as never)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('logs cleanup failure but keeps db update', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
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
        imageUrl: uploadedImage.url,
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

      expect(result).toMatchObject(updated);
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });
  });

  describe('remove', () => {
    it('deletes the product and image asynchronously', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.delete as unknown as jest.Mock).mockResolvedValue(
        existing
      );

      const result = await service.remove('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(result).toMatchObject(existing);
      expect(result).toBeInstanceOf(ProductResponseDto);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('logs cleanup failure but keeps db deletion', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
      };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.delete as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (uploadService.deleteImage as unknown as jest.Mock).mockRejectedValue(
        new Error('delete failed')
      );
      const loggerSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.remove('product-1');

      expect(result).toMatchObject(existing);
      expect(uploadService.deleteImage).toHaveBeenCalledWith('products/old');
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });
  });

  describe('removeImage', () => {
    it('clears image fields and deletes the cloudinary asset', async () => {
      const existing = {
        id: 'product-1',
        name: 'Engine oil',
        price: '30',
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
      };
      const updated = {
        ...existing,
        imageUrl: null,
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
        data: { imageUrl: null, imagePublicId: null },
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
        imageUrl: 'https://old.url',
        imagePublicId: 'products/old',
      };
      const updated = {
        ...existing,
        imageUrl: null,
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
