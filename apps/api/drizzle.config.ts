import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'drizzle-kit';

const LOCAL_DB_PATH = path.join(
  process.cwd(),
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
);

function findLocalDbFile(): string {
  try {
    const files = fs.readdirSync(LOCAL_DB_PATH);
    const dbFile = files.find(file => file.endsWith('.sqlite'));
    return dbFile ? path.join(LOCAL_DB_PATH, dbFile) : path.join(LOCAL_DB_PATH, 'database.sqlite');
  } catch {
    return path.join(LOCAL_DB_PATH, 'database.sqlite');
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isLocal = process.env.WEBAPP_ENV === 'local';
const isPreview = process.env.WEBAPP_ENV === 'preview';

export default defineConfig({
  schema: './src/db/tables/*.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  ...(isLocal
    ? {
        dbCredentials: { url: findLocalDbFile() },
      }
    : {
        driver: 'd1-http',
        dbCredentials: {
          accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
          token: requireEnv('D1_TOKEN'),
          databaseId: isPreview
            ? requireEnv('PREVIEW_DATABASE_ID')
            : requireEnv('PROD_DATABASE_ID'),
        },
      }),
});
