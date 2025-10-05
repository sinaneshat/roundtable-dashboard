import * as fs from 'node:fs';
import * as path from 'node:path';

import { defineConfig } from 'drizzle-kit';

const isLocal = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local' || process.env.NODE_ENV === 'development';

// Local database configuration
const LOCAL_DB_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const LOCAL_DB_PATH = path.join(process.cwd(), LOCAL_DB_DIR);

function getLocalDbPath(): string {
  // Create directory if it doesn't exist
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.mkdirSync(LOCAL_DB_PATH, { recursive: true });
  }

  // Look for existing SQLite file
  try {
    const files = fs.readdirSync(LOCAL_DB_PATH);
    const dbFile = files.find(file => file.endsWith('.sqlite'));
    if (dbFile) {
      return path.join(LOCAL_DB_PATH, dbFile);
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Return default path
  return path.join(LOCAL_DB_PATH, 'database.sqlite');
}

// Remote database configuration with graceful fallbacks
function getRemoteConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.D1_TOKEN;
  const databaseId = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'preview'
    ? process.env.PREVIEW_DATABASE_ID
    : process.env.PROD_DATABASE_ID;

  // Return null if any required vars are missing (will fall back to local)
  if (!accountId || !token || !databaseId) {
    console.warn('Remote database configuration incomplete, falling back to local development');
    return null;
  }

  return {
    accountId,
    token,
    databaseId,
  };
}

// Export configuration based on environment
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  verbose: true,
  strict: true,
  ...(isLocal
    ? {
        // Local development configuration
        dbCredentials: {
          url: getLocalDbPath(),
        },
      }
    : (() => {
        // Remote D1 configuration with fallback
        const remoteConfig = getRemoteConfig();
        if (remoteConfig) {
          return {
            driver: 'd1-http',
            dbCredentials: remoteConfig,
          };
        } else {
          // Fallback to local if remote config is unavailable
          return {
            dbCredentials: {
              url: getLocalDbPath(),
            },
          };
        }
      })()),
});
