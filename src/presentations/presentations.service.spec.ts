import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PresentationsService } from './presentations.service';

describe('PresentationsService', () => {
  let service: PresentationsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      presentation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new PresentationsService(prisma);
  });

  describe('findAll', () => {
    it('returns all presentations ordered by name', async () => {
      const presentations = [
        { id: 'pres-2', name: 'Botella' },
        { id: 'pres-1', name: 'Galón' },
      ];
      (prisma.presentation.findMany as unknown as jest.Mock).mockResolvedValue(
        presentations
      );

      const result = await service.findAll();

      expect(prisma.presentation.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(presentations);
    });
  });

  describe('findOne', () => {
    it('returns the presentation with the requested id', async () => {
      const presentation = {
        id: 'pres-1',
        name: 'Galón',
      };
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue(presentation);

      const result = await service.findOne('pres-1');

      expect(prisma.presentation.findUnique).toHaveBeenCalledWith({
        where: { id: 'pres-1' },
      });
      expect(result).toEqual(presentation);
    });

    it('throws NotFoundException when the presentation does not exist', async () => {
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    it('creates a presentation with the provided data', async () => {
      const dto = { name: 'Galón' };
      const created = { id: 'pres-1', ...dto };
      (prisma.presentation.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto);

      expect(prisma.presentation.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(created);
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Galón' };
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.presentation.create as unknown as jest.Mock).mockRejectedValue(
        error
      );

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates a presentation', async () => {
      const dto = { name: 'Galón Updated' };
      const updated = { id: 'pres-1', ...dto };
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue({
        id: 'pres-1',
      });
      (prisma.presentation.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('pres-1', dto);

      expect(prisma.presentation.findUnique).toHaveBeenCalledWith({
        where: { id: 'pres-1' },
      });
      expect(prisma.presentation.update).toHaveBeenCalledWith({
        where: { id: 'pres-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the presentation does not exist', async () => {
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'X' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.presentation.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Existing' };
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue({
        id: 'pres-1',
      });
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.presentation.update as unknown as jest.Mock).mockRejectedValue(
        error
      );

      await expect(service.update('pres-1', dto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    it('deletes a presentation', async () => {
      const deleted = { id: 'pres-1', name: 'Galón' };
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue({
        id: 'pres-1',
      });
      (prisma.presentation.delete as unknown as jest.Mock).mockResolvedValue(
        deleted
      );

      const result = await service.remove('pres-1');

      expect(prisma.presentation.findUnique).toHaveBeenCalledWith({
        where: { id: 'pres-1' },
      });
      expect(prisma.presentation.delete).toHaveBeenCalledWith({
        where: { id: 'pres-1' },
      });
      expect(result).toEqual(deleted);
      expect(prisma.presentation.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the presentation does not exist', async () => {
      (
        prisma.presentation.findUnique as unknown as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.presentation.delete).not.toHaveBeenCalled();
      expect(prisma.presentation.update).not.toHaveBeenCalled();
    });
  });
});
