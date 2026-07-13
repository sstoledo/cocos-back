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
});
