// Global teardown: force-stops the container started by global-setup.ts via
// the docker CLI (guaranteed available: the cold start requires Docker), then
// removes the runtime URL file.
import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import { promisify } from 'node:util';
import { DB_URL_FILE, readDbRecord } from './db-url-file';

const execAsync = promisify(exec);

module.exports = async () => {
  const record = readDbRecord();
  if (record?.id) {
    try {
      await execAsync(`docker rm -f ${record.id}`);
    } catch (err) {
      // Container may already be gone (e.g. IDE two-runs raced teardown).
      console.warn(
        `[integration-teardown] could not remove container ${record.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  try {
    fs.rmSync(DB_URL_FILE, { force: true });
  } catch {
    // Nothing to clean.
  }
};
