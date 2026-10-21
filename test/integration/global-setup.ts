import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
// Jest global setup: starts one Postgres container for the WHOLE integration
// run, applies `prisma migrate deploy` against it, and persists the
// connection URL to DB_URL_FILE so worker processes (setupFiles) can bind to
// it and teardown can stop the container. Cold start requires only Docker.
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DB_URL_FILE } from './db-url-file';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

module.exports = async () => {
  const started = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('cocos_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const url = started.getConnectionUri();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  fs.writeFileSync(DB_URL_FILE, JSON.stringify({ url, id: started.getId() }));

  return async () => {
    try {
      await started.stop();
    } finally {
      fs.rmSync(DB_URL_FILE, { force: true });
    }
  };
};
