import type { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      category: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new CategoriesService(prisma);
  });

  describe('findAll', () => {
    it('returns all categories ordered by name with parent included', async () => {
      const categories = [
        {
          id: 'cat-2',
          name: 'Lubricantes',
          parentId: null,
          parent: null,
        },
        {
          id: 'cat-1',
          name: 'Repuestos',
          parentId: 'cat-2',
          parent: { id: 'cat-2', name: 'Lubricantes' },
        },
      ];
      (prisma.category.findMany as unknown as jest.Mock).mockResolvedValue(
        categories
      );

      const result = await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { parent: true },
      });
      expect(result).toEqual(categories);
    });
  });
});
