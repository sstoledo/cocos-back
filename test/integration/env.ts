// Runs as jest setupFiles BEFORE the test module graph loads. Binds
// DATABASE_URL to the Testcontainers Postgres started by global-setup.ts.
// Without it, importing any module that constructs PrismaClient (auth.ts,
// PrismaService) fails with a missing-DATABASE_URL error.
import { readDbRecord } from './db-url-file';

const record = readDbRecord();

if (!record) {
  throw new Error(
    'Integration run without a bootstrap DB: run `pnpm test:integration` ' +
      '(it starts the Testcontainers Postgres in globalSetup). If you are ' +
      'opening a single spec from your IDE, run `pnpm test:integration` ' +
      'directly instead.'
  );
}

process.env.DATABASE_URL = record.url;
