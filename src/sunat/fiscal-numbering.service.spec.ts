import { FiscalNumberingService } from './fiscal-numbering.service';

const buildPrisma = () => ({
  fiscalNumberSequence: {
    upsert: jest.fn(),
  },
});

describe('FiscalNumberingService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: FiscalNumberingService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new FiscalNumberingService(prisma as never);
  });

  it('increments the sequence for the serie and returns serie + correlativo', async () => {
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      id: 'seq-1',
      serie: 'F001',
      lastNumber: 7,
    });

    await expect(service.nextNumber('F001')).resolves.toEqual({
      serie: 'F001',
      correlativo: 7,
    });

    expect(prisma.fiscalNumberSequence.upsert).toHaveBeenCalledWith({
      where: { serie: 'F001' },
      create: { serie: 'F001', lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
  });

  it('starts at 1 when the serie has no sequence yet', async () => {
    prisma.fiscalNumberSequence.upsert.mockResolvedValue({
      id: 'seq-2',
      serie: 'B001',
      lastNumber: 1,
    });

    await expect(service.nextNumber('B001')).resolves.toEqual({
      serie: 'B001',
      correlativo: 1,
    });
  });
});
