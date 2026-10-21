import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { truncateAll } from './helpers';

// Bootstrap smoke: proves the container is reachable, migrations applied, and
// the shared truncate helper works, WITHOUT importing AppModule (whose auth
// singleton constructs its own PrismaClient against the integration DB and
// needs no HTTP layer at service level).
describe('bootstrap (integration smoke)', () => {
  let prisma: PrismaService;
  let deinit: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await moduleRef.init();
    deinit = () => moduleRef.close();
  });

  afterAll(async () => {
    await deinit?.();
  });

  it('connects to the containerized Postgres and truncates cleanly', async () => {
    const result =
      await prisma.$queryRawUnsafe<{ version: string }[]>('SELECT version()');
    expect(result.length).toBe(1);
    const row = await prisma.cashClosing.findFirst();
    expect(row).toBeNull();
    await truncateAll(prisma);
  });
});
