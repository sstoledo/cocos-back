import * as fs from 'node:fs';
// Shared constants for the integration run: global setup writes the runtime
// DB record here; each jest worker reads it in setupFiles before any module
// import (auth.ts and PrismaService both construct PrismaClient at import
// time), so the file must be read before the test module loads.
import * as os from 'node:os';
import * as path from 'node:path';

export interface IntegrationDbRecord {
  url: string;
  id: string;
}

export const DB_URL_FILE = path.join(
  os.tmpdir(),
  'cocos-integration-db-url.json'
);

export function readDbRecord(): IntegrationDbRecord | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(DB_URL_FILE, 'utf8')
    ) as Partial<IntegrationDbRecord> | null;
    if (parsed?.url && parsed?.id) return { url: parsed.url, id: parsed.id };
    return null;
  } catch {
    return null;
  }
}
