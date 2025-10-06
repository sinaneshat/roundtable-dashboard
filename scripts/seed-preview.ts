/**
 * Seed Preview Database
 *
 * Seeds the preview database with products and quotas via wrangler CLI
 * This script generates SQL and executes it on the remote preview database
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ulid } from 'ulid';

const NOW = new Date().getTime(); // Unix timestamp in milliseconds

// ============================================================================
// QUOTA CONFIGURATIONS
// ============================================================================

const QUOTA_CONFIGURATIONS = [
  {
    id: ulid(),
    tier: 'free',
    isAnnual: 0,
    threadsPerMonth: 2,
    messagesPerMonth: 20,
    memoriesPerMonth: 5,
    customRolesPerMonth: 5,
    maxAiModels: 5,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 0,
    metadata: JSON.stringify({
      description: 'Free tier - perfect for trying out Roundtable',
      displayOrder: '1',
    }),
  },
  {
    id: ulid(),
    tier: 'starter',
    isAnnual: 0,
    threadsPerMonth: 30,
    messagesPerMonth: 150,
    memoriesPerMonth: 15,
    customRolesPerMonth: 15,
    maxAiModels: 5,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Starter tier for individuals making 1-2 important decisions per week',
      displayOrder: '2',
      stripeProductId: 'prod_TAbABj98toEKg7',
    }),
  },
  {
    id: ulid(),
    tier: 'starter',
    isAnnual: 1,
    threadsPerMonth: 30,
    messagesPerMonth: 150,
    memoriesPerMonth: 15,
    customRolesPerMonth: 15,
    maxAiModels: 5,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Starter tier for individuals (annual billing)',
      displayOrder: '2',
      stripeProductId: 'prod_TAbABj98toEKg7',
    }),
  },
  {
    id: ulid(),
    tier: 'pro',
    isAnnual: 0,
    threadsPerMonth: 75,
    messagesPerMonth: 400,
    memoriesPerMonth: 30,
    customRolesPerMonth: 30,
    maxAiModels: 7,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Pro tier for serious decision makers',
      displayOrder: '3',
      badge: 'most_popular',
      stripeProductId: 'prod_TAbATZPEiE2y9o',
    }),
  },
  {
    id: ulid(),
    tier: 'pro',
    isAnnual: 1,
    threadsPerMonth: 75,
    messagesPerMonth: 400,
    memoriesPerMonth: 30,
    customRolesPerMonth: 30,
    maxAiModels: 7,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Pro tier for serious decision makers (annual billing)',
      displayOrder: '3',
      badge: 'most_popular',
      stripeProductId: 'prod_TAbATZPEiE2y9o',
    }),
  },
  {
    id: ulid(),
    tier: 'power',
    isAnnual: 0,
    threadsPerMonth: 300,
    messagesPerMonth: 1800,
    memoriesPerMonth: 100,
    customRolesPerMonth: 100,
    maxAiModels: 15,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Power tier for teams needing extensive research capabilities',
      displayOrder: '4',
      stripeProductId: 'prod_TAbA8kAHcag3Kb',
    }),
  },
  {
    id: ulid(),
    tier: 'power',
    isAnnual: 1,
    threadsPerMonth: 300,
    messagesPerMonth: 1800,
    memoriesPerMonth: 100,
    customRolesPerMonth: 100,
    maxAiModels: 15,
    allowCustomRoles: 1,
    allowMemories: 1,
    allowThreadExport: 1,
    metadata: JSON.stringify({
      description: 'Power tier for teams (annual billing)',
      displayOrder: '4',
      stripeProductId: 'prod_TAbA8kAHcag3Kb',
    }),
  },
];

// ============================================================================
// STRIPE PRODUCTS
// ============================================================================

const PRODUCTS = [
  {
    id: 'prod_TAbABj98toEKg7',
    name: 'Starter',
    description: 'Perfect for individuals making 1-2 important decisions per week',
    active: 1,
    default_price_id: 'price_1SEFyVGx4IA5m8Qe8Wo4WGYK',
    metadata: JSON.stringify({
      tier: 'starter',
      displayOrder: '2',
      features: JSON.stringify([
        '150 messages / month',
        'Up to 5 AI models',
        '30 conversations / month',
        'Advanced AI models',
      ]),
    }),
    images: JSON.stringify([]),
    features: JSON.stringify([
      '150 messages / month',
      'Up to 5 AI models',
      '30 conversations / month',
      'Advanced AI models',
    ]),
  },
  {
    id: 'prod_TAbATZPEiE2y9o',
    name: 'Pro',
    description: 'For serious decision makers who need 2-3 important decisions every day',
    active: 1,
    default_price_id: 'price_1SEFyWGx4IA5m8QesQBukr4b',
    metadata: JSON.stringify({
      tier: 'pro',
      displayOrder: '3',
      badge: 'most_popular',
      features: JSON.stringify([
        '400 messages / month',
        'Up to 7 AI models',
        '75 conversations / month',
        'Advanced AI models',
      ]),
    }),
    images: JSON.stringify([]),
    features: JSON.stringify([
      '400 messages / month',
      'Up to 7 AI models',
      '75 conversations / month',
      'Advanced AI models',
    ]),
  },
  {
    id: 'prod_TAbA8kAHcag3Kb',
    name: 'Power',
    description: 'For teams that need extensive research and discovery capabilities',
    active: 1,
    default_price_id: 'price_1SEFyYGx4IA5m8QeXhso3m35',
    metadata: JSON.stringify({
      tier: 'power',
      displayOrder: '4',
      features: JSON.stringify([
        '1,800 messages / month',
        'Up to 15 AI models',
        '300 conversations / month',
        'Advanced AI models',
      ]),
    }),
    images: JSON.stringify([]),
    features: JSON.stringify([
      '1,800 messages / month',
      'Up to 15 AI models',
      '300 conversations / month',
      'Advanced AI models',
    ]),
  },
];

// ============================================================================
// STRIPE PRICES
// ============================================================================

const PRICES = [
  // Starter prices
  {
    id: 'price_1SEFyVGx4IA5m8Qe8Wo4WGYK',
    product_id: 'prod_TAbABj98toEKg7',
    active: 1,
    currency: 'usd',
    unit_amount: 2000,
    type: 'recurring',
    interval: 'month',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({ tier: 'starter', billingPeriod: 'monthly' }),
  },
  {
    id: 'price_1SEFyVGx4IA5m8QevBWdcRom',
    product_id: 'prod_TAbABj98toEKg7',
    active: 1,
    currency: 'usd',
    unit_amount: 20000,
    type: 'recurring',
    interval: 'year',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({
      tier: 'starter',
      billingPeriod: 'annual',
      savingsPercent: '17',
    }),
  },
  // Pro prices
  {
    id: 'price_1SEFyWGx4IA5m8QesQBukr4b',
    product_id: 'prod_TAbATZPEiE2y9o',
    active: 1,
    currency: 'usd',
    unit_amount: 5900,
    type: 'recurring',
    interval: 'month',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({ tier: 'pro', billingPeriod: 'monthly' }),
  },
  {
    id: 'price_1SEFyXGx4IA5m8QeM8s6Iu54',
    product_id: 'prod_TAbATZPEiE2y9o',
    active: 1,
    currency: 'usd',
    unit_amount: 60000,
    type: 'recurring',
    interval: 'year',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({
      tier: 'pro',
      billingPeriod: 'annual',
      savingsPercent: '15',
    }),
  },
  // Power prices
  {
    id: 'price_1SEFyYGx4IA5m8QeXhso3m35',
    product_id: 'prod_TAbA8kAHcag3Kb',
    active: 1,
    currency: 'usd',
    unit_amount: 24900,
    type: 'recurring',
    interval: 'month',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({ tier: 'power', billingPeriod: 'monthly' }),
  },
  {
    id: 'price_1SEFyYGx4IA5m8Qeukamf1lQ',
    product_id: 'prod_TAbA8kAHcag3Kb',
    active: 1,
    currency: 'usd',
    unit_amount: 250000,
    type: 'recurring',
    interval: 'year',
    interval_count: 1,
    trial_period_days: null,
    metadata: JSON.stringify({
      tier: 'power',
      billingPeriod: 'annual',
      savingsPercent: '16',
    }),
  },
];

// ============================================================================
// Generate SQL
// ============================================================================

function generateSeedSQL(): string {
  let sql = '-- Preview Database Seed\n\n';

  // Insert quotas
  sql += '-- Subscription Tier Quotas\n';
  for (const quota of QUOTA_CONFIGURATIONS) {
    sql += `INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, memories_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_memories, allow_thread_export, metadata, created_at, updated_at) VALUES ('${quota.id}', '${quota.tier}', ${quota.isAnnual}, ${quota.threadsPerMonth}, ${quota.messagesPerMonth}, ${quota.memoriesPerMonth}, ${quota.customRolesPerMonth}, ${quota.maxAiModels}, ${quota.allowCustomRoles}, ${quota.allowMemories}, ${quota.allowThreadExport}, '${quota.metadata}', ${NOW}, ${NOW});\n`;
  }

  sql += '\n-- Stripe Products\n';
  for (const product of PRODUCTS) {
    sql += `INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES ('${product.id}', '${product.name}', '${product.description}', ${product.active}, '${product.default_price_id}', '${product.metadata}', '${product.images}', '${product.features}', ${NOW}, ${NOW});\n`;
  }

  sql += '\n-- Stripe Prices\n';
  for (const price of PRICES) {
    const trialDays = price.trial_period_days === null ? 'NULL' : price.trial_period_days;
    sql += `INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, \`interval\`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('${price.id}', '${price.product_id}', ${price.active}, '${price.currency}', ${price.unit_amount}, '${price.type}', '${price.interval}', ${price.interval_count}, ${trialDays}, '${price.metadata}', ${NOW}, ${NOW});\n`;
  }

  return sql;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🌱 Generating seed SQL for preview database...\n');

  const sql = generateSeedSQL();
  const sqlFilePath = path.join(process.cwd(), 'src/db/seed_preview.sql');

  // Write SQL file
  fs.writeFileSync(sqlFilePath, sql);
  console.log(`📄 Generated seed SQL file: ${sqlFilePath}\n`);

  console.log('🚀 Executing seed on preview database...\n');

  try {
    execSync(`npx wrangler d1 execute DB --remote --env=preview --file=${sqlFilePath}`, {
      stdio: 'inherit',
    });

    console.log('\n✅ Preview database seeded successfully!\n');
    console.log('📊 Seeded:');
    console.log(`  - ${QUOTA_CONFIGURATIONS.length} subscription tier quotas`);
    console.log(`  - ${PRODUCTS.length} Stripe products`);
    console.log(`  - ${PRICES.length} Stripe prices\n`);
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('🎉 Seed completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
