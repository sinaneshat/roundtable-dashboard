/**
 * Seed Subscription Tier Quotas
 *
 * Populates the subscription_tier_quotas table with default quota configurations
 * matching the actual pricing page and Stripe products.
 *
 * TIER MAPPING:
 * - Free: 20 messages, 2 conversations, 5 AI models (no Stripe product)
 * - Starter: 150 messages, 30 conversations, 5 AI models (prod_TAbABj98toEKg7, $20/mo)
 * - Pro: 400 messages, 75 conversations, 7 AI models (prod_TAbATZPEiE2y9o, $59/mo)
 * - Power: 1,800 messages, 300 conversations, 15 AI models (prod_TAbA8kAHcag3Kb, $249/mo)
 *
 * Run with: pnpm db:seed:quotas
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ulid } from 'ulid';

import * as tables from '../src/db/schema';

// Subscription tier quota configurations matching the pricing page
const QUOTA_CONFIGURATIONS = [
  // ============================================================================
  // FREE TIER - Entry level for trying out features
  // ============================================================================
  {
    id: ulid(),
    tier: 'free' as const,
    isAnnual: false,
    threadsPerMonth: 2, // "2 conversations / mo"
    messagesPerMonth: 20, // "20 messages / mo"
    maxAiModels: 5, // "Up to 5 AI models"
    allowCustomRoles: true, // Allow for development/testing
    allowMemories: true, // Allow for development/testing
    allowThreadExport: false,
    metadata: {
      description: 'Free tier - perfect for trying out Roundtable',
      displayOrder: '1',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ============================================================================
  // STARTER TIER - $20/month or $200/year
  // Product: prod_TAbABj98toEKg7
  // ============================================================================
  {
    id: ulid(),
    tier: 'starter' as const,
    isAnnual: false,
    threadsPerMonth: 30, // "30 conversations / mo"
    messagesPerMonth: 150, // "150 messages / mo"
    maxAiModels: 5, // "Up to 5 AI models"
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Starter tier for individuals making 1-2 important decisions per week',
      displayOrder: '2',
      stripeProductId: 'prod_TAbABj98toEKg7',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: ulid(),
    tier: 'starter' as const,
    isAnnual: true,
    threadsPerMonth: 30,
    messagesPerMonth: 150,
    maxAiModels: 5,
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Starter tier for individuals (annual billing)',
      displayOrder: '2',
      stripeProductId: 'prod_TAbABj98toEKg7',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ============================================================================
  // PRO TIER - $59/month or $600/year (MOST POPULAR)
  // Product: prod_TAbATZPEiE2y9o
  // ============================================================================
  {
    id: ulid(),
    tier: 'pro' as const,
    isAnnual: false,
    threadsPerMonth: 75, // "75 conversations / mo"
    messagesPerMonth: 400, // "400 messages / mo"
    maxAiModels: 7, // "Up to 7 AI models"
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Pro tier for serious decision makers',
      displayOrder: '3',
      badge: 'most_popular',
      stripeProductId: 'prod_TAbATZPEiE2y9o',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: ulid(),
    tier: 'pro' as const,
    isAnnual: true,
    threadsPerMonth: 75,
    messagesPerMonth: 400,
    maxAiModels: 7,
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Pro tier for serious decision makers (annual billing)',
      displayOrder: '3',
      badge: 'most_popular',
      stripeProductId: 'prod_TAbATZPEiE2y9o',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  // ============================================================================
  // POWER TIER - $249/month or $2500/year
  // Product: prod_TAbA8kAHcag3Kb
  // ============================================================================
  {
    id: ulid(),
    tier: 'power' as const,
    isAnnual: false,
    threadsPerMonth: 300, // "300 conversations / mo"
    messagesPerMonth: 1800, // "1,800 messages / mo"
    maxAiModels: 15, // "Up to 15 AI models"
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Power tier for teams needing extensive research capabilities',
      displayOrder: '4',
      stripeProductId: 'prod_TAbA8kAHcag3Kb',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: ulid(),
    tier: 'power' as const,
    isAnnual: true,
    threadsPerMonth: 300,
    messagesPerMonth: 1800,
    maxAiModels: 15,
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
    metadata: {
      description: 'Power tier for teams (annual billing)',
      displayOrder: '4',
      stripeProductId: 'prod_TAbA8kAHcag3Kb',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function getLocalDbPath(): string {
  const LOCAL_DB_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const LOCAL_DB_PATH = path.join(process.cwd(), LOCAL_DB_DIR);

  // Look for existing SQLite file
  try {
    const files = fs.readdirSync(LOCAL_DB_PATH);
    const dbFile = files.find(file => file.endsWith('.sqlite'));
    if (dbFile) {
      return path.join(LOCAL_DB_PATH, dbFile);
    }
  } catch {
    // Directory doesn't exist
  }

  throw new Error(
    'Local database not found. Please run the dev server first to create the database.',
  );
}

async function seed() {
  console.log('🌱 Seeding subscription tier quotas...');
  console.log('📋 Matching pricing page tiers exactly:\n');

  // Connect to local SQLite database
  const dbPath = getLocalDbPath();
  console.log(`📁 Using database: ${dbPath}\n`);

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Clear existing quotas first to avoid conflicts
  console.log('🗑️  Clearing existing quota configurations...');
  await db.delete(tables.subscriptionTierQuotas);

  // Insert all quota configurations
  await db.insert(tables.subscriptionTierQuotas).values(QUOTA_CONFIGURATIONS);

  console.log('✅ Seeded subscription tier quotas successfully!\n');
  console.log(`📊 Inserted ${QUOTA_CONFIGURATIONS.length} quota configurations:\n`);
  console.log('  💚 Free:');
  console.log('     - 20 messages/month');
  console.log('     - 2 conversations/month');
  console.log('     - Up to 5 AI models\n');
  console.log('  🚀 Starter ($20/mo, $200/yr):');
  console.log('     - 150 messages/month');
  console.log('     - 30 conversations/month');
  console.log('     - Up to 5 AI models');
  console.log('     - Stripe: prod_TAbABj98toEKg7\n');
  console.log('  ⭐ Pro ($59/mo, $600/yr) - MOST POPULAR:');
  console.log('     - 400 messages/month');
  console.log('     - 75 conversations/month');
  console.log('     - Up to 7 AI models');
  console.log('     - Stripe: prod_TAbATZPEiE2y9o\n');
  console.log('  ⚡ Power ($249/mo, $2500/yr):');
  console.log('     - 1,800 messages/month');
  console.log('     - 300 conversations/month');
  console.log('     - Up to 15 AI models');
  console.log('     - Stripe: prod_TAbA8kAHcag3Kb\n');
}

seed()
  .then(() => {
    console.log('🎉 Seed completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
