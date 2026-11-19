import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

const buildPrisma = () => ({
  companySettings: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

describe('SettingsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: SettingsService;

  const existingRow = {
    id: 'settings-1',
    ruc: null,
    legalName: null,
    address: null,
    facturaSeries: 'F001',
    boletaSeries: 'B001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = buildPrisma();
    service = new SettingsService(prisma as never);
  });

  describe('getCompanySettings', () => {
    it('returns the existing settings row', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);

      await expect(service.getCompanySettings()).resolves.toEqual(existingRow);
      expect(prisma.companySettings.findFirst).toHaveBeenCalledTimes(1);
    });

    it('creates an empty default row when none exists', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(null);
      prisma.companySettings.create.mockResolvedValue({
        ...existingRow,
        id: 'settings-2',
      });

      await service.getCompanySettings();

      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: { facturaSeries: 'F001', boletaSeries: 'B001' },
      });
    });
  });

  describe('updateCompanySettings', () => {
    it('updates the provided fiscal fields', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);
      prisma.companySettings.update.mockResolvedValue({
        ...existingRow,
        ruc: '20100070970',
        legalName: 'Cocos SAC',
      });

      const result = await service.updateCompanySettings({
        ruc: '20100070970',
        legalName: 'Cocos SAC',
      });

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: existingRow.id },
        data: { ruc: '20100070970', legalName: 'Cocos SAC' },
      });
      expect(result.ruc).toBe('20100070970');
    });

    it('creates the settings row first when none exists, then updates it', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(null);
      prisma.companySettings.create.mockResolvedValue(existingRow);
      prisma.companySettings.update.mockResolvedValue(existingRow);

      await service.updateCompanySettings({ address: 'Av. Siempre Viva 742' });

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: existingRow.id },
        data: { address: 'Av. Siempre Viva 742' },
      });
    });

    it('rejects an invalid RUC with BadRequestException', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);

      await expect(
        service.updateCompanySettings({ ruc: '12345678901' })
      ).rejects.toThrow(BadRequestException);
      expect(prisma.companySettings.update).not.toHaveBeenCalled();
    });

    it('rejects empty series values with BadRequestException', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);

      await expect(
        service.updateCompanySettings({ facturaSeries: '   ' })
      ).rejects.toThrow(BadRequestException);
      expect(prisma.companySettings.update).not.toHaveBeenCalled();
    });

    it('saves a ubigeo that exists in the INEI catalog', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);
      prisma.companySettings.update.mockResolvedValue({
        ...existingRow,
        ubigeo: '150122',
      });

      await service.updateCompanySettings({ ubigeo: '150122' });

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: existingRow.id },
        data: { ubigeo: '150122' },
      });
    });

    it('rejects a ubigeo that is not in the catalog', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);

      await expect(
        service.updateCompanySettings({ ubigeo: '999999' })
      ).rejects.toThrow(BadRequestException);
      expect(prisma.companySettings.update).not.toHaveBeenCalled();
    });

    it('clears the ubigeo when an empty string is sent', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(existingRow);
      prisma.companySettings.update.mockResolvedValue(existingRow);

      await service.updateCompanySettings({ ubigeo: '' });

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: existingRow.id },
        data: { ubigeo: null },
      });
    });
  });
});
