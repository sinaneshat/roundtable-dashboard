-- Database Seed File
--
-- ✅ STRIPE DATA ONLY: Seeds Stripe products and prices
-- ⚠️ NO BUSINESS LOGIC: All quotas, limits, and features are in product-logic.service.ts
--
-- This file contains ONLY Stripe catalog data:
-- - Products (what can be purchased)
-- - Prices (how much they cost)
-- - Product metadata (tier name for identification)
--
-- Business rules (quotas, model limits, feature flags) live in:
-- src/api/services/product-logic.service.ts
--
-- Usage:
--   Local:   pnpm db:seed:local
--   Preview: pnpm db:seed:preview
--   Prod:    pnpm db:seed:prod

-- ============================================================================
-- STRIPE PRODUCTS
-- ============================================================================
-- Products represent what users can subscribe to
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TAbABj98toEKg7', 'Starter', 'Budget-friendly AI models with enhanced performance', 1, 'price_1SEFyVGx4IA5m8Qe8Wo4WGYK', '{"tier":"starter","displayOrder":"2"}', '[]', '["150 messages per month","Up to 5 AI models","30 conversations per month","Advanced AI models","3 custom AI roles","Access to affordable, fast AI models"]', 1759761697591, 1759761697591);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TAbATZPEiE2y9o', 'Pro', 'Professional-grade AI models with excellent quality', 1, 'price_1SEFyWGx4IA5m8QesQBukr4b', '{"tier":"pro","displayOrder":"3","badge":"most_popular"}', '[]', '["400 messages per month","Up to 7 AI models","75 conversations per month","Advanced AI models","10 custom AI roles","Thread export","Access to professional-grade AI models"]', 1759761697591, 1759761697591);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TAbA8kAHcag3Kb', 'Power', 'Flagship AI models with maximum capabilities', 1, 'price_1SEFyYGx4IA5m8QeXhso3m35', '{"tier":"power","displayOrder":"4"}', '[]', '["1,800 messages per month","Up to 15 AI models","300 conversations per month","Advanced AI models","50 custom AI roles","Thread export","Access to all available flagship AI models"]', 1759761697591, 1759761697591);

-- ============================================================================
-- STRIPE PRICES
-- ============================================================================
-- Prices define the cost for each product
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

-- Starter Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyVGx4IA5m8Qe8Wo4WGYK', 'prod_TAbABj98toEKg7', 1, 'usd', 2000, 'recurring', 'month', 1, NULL, '{"tier":"starter","billingPeriod":"monthly"}', 1759761697591, 1759761697591);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyVGx4IA5m8QevBWdcRom', 'prod_TAbABj98toEKg7', 1, 'usd', 20000, 'recurring', 'year', 1, NULL, '{"tier":"starter","billingPeriod":"annual","savingsPercent":"17"}', 1759761697591, 1759761697591);

-- Pro Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyWGx4IA5m8QesQBukr4b', 'prod_TAbATZPEiE2y9o', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"tier":"pro","billingPeriod":"monthly"}', 1759761697591, 1759761697591);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyXGx4IA5m8QeM8s6Iu54', 'prod_TAbATZPEiE2y9o', 1, 'usd', 60000, 'recurring', 'year', 1, NULL, '{"tier":"pro","billingPeriod":"annual","savingsPercent":"15"}', 1759761697591, 1759761697591);

-- Power Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyYGx4IA5m8QeXhso3m35', 'prod_TAbA8kAHcag3Kb', 1, 'usd', 24900, 'recurring', 'month', 1, NULL, '{"tier":"power","billingPeriod":"monthly"}', 1759761697591, 1759761697591);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SEFyYGx4IA5m8Qeukamf1lQ', 'prod_TAbA8kAHcag3Kb', 1, 'usd', 250000, 'recurring', 'year', 1, NULL, '{"tier":"power","billingPeriod":"annual","savingsPercent":"16"}', 1759761697591, 1759761697591);
