import type { PrismaService } from '../prisma/prisma.service';
import { BrandsService } from './brands.service';

describe('BrandsService', () => {
  let service: BrandsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      brand: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new BrandsService(prisma);
  });

  describe('findAll', () => {
    it('returns all brands ordered by name', async () => {
      const brands = [
        { id: 'brand-2', name: 'Mobil' },
        { id: 'brand-1', name: 'Shell' },
      ];
      (prisma.brand.findMany as unknown as jest.Mock).mockResolvedValue(brands);

      const result = await service.findAll();

      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(brands);
    });
  });
});
