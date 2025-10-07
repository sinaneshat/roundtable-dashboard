import fs from 'node:fs';
import path from 'node:path';

import type { Config } from 'drizzle-kit';
import { defineConfig } from 'drizzle-kit';

const LOCAL_DB_PATH = path.join(
  process.cwd(),
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
);

function findLocalDbFile() {
  try {
    const files = fs.readdirSync(LOCAL_DB_PATH);
    const dbFile = files.find(file => file.endsWith('.sqlite'));
    return dbFile ? path.join(LOCAL_DB_PATH, dbFile) : null;
  } catch {
    return null;
  }
}

// Since drizzle-kit config can't be async, we need to use process.env directly here
// This is for build-time usage, so it's acceptable to use process.env
export default process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local'
  ? defineConfig({
      schema: './src/db/schema.ts',
      out: './src/db/migrations',
      dialect: 'sqlite',
      dbCredentials: {
        url: findLocalDbFile() || path.join(LOCAL_DB_PATH, 'database.sqlite'),
      },
    })
  : (defineConfig({
      schema: './src/db/schema.ts',
      out: './src/db/migrations',
      driver: 'd1-http',
      dialect: 'sqlite',
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        token: process.env.D1_TOKEN!,
        databaseId:
          process.env.NEXT_PUBLIC_WEBAPP_ENV === 'preview'
            ? process.env.PREVIEW_DATABASE_ID!
            : process.env.PROD_DATABASE_ID!,
      },
    }) satisfies Config);
