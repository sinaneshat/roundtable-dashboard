-- Database Seed File - LOCAL ENVIRONMENT
--
-- Environment: LOCAL (Test Mode)
-- Stripe Account: acct_1Rw8lgGx4IA5m8Qe
-- Mode: TEST MODE
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
--   pnpm db:seed:local

-- ============================================================================
-- STRIPE PRODUCTS
-- ============================================================================
-- Products represent what users can subscribe to
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMlR6It7OXeUFf', 'Starter', 'Budget-friendly AI models with enhanced performance', 1, 'price_1SQ1vEGx4IA5m8QeeZqGPlH7', '{"tier":"starter","displayOrder":"2"}', '[]', '["150 messages per month","Up to 5 AI models","30 conversations per month","Advanced AI models","3 custom AI roles","Access to affordable, fast AI models"]', 1762330696000, 1762330739000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMlS4JgDD5IHGb', 'Pro', 'Professional-grade AI models with excellent quality', 1, 'price_1SQ1w4Gx4IA5m8QeugZ8Ikeg', '{"tier":"pro","displayOrder":"3","badge":"most_popular"}', '[]', '["400 messages per month","Up to 7 AI models","75 conversations per month","Advanced AI models","10 custom AI roles","Thread export","Access to professional-grade AI models"]', 1762330744000, 1762330777000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMlTwCUfD1dwoC', 'Power', 'Flagship AI models with maximum capabilities', 1, 'price_1SQ1weGx4IA5m8QeQlS9zmwE', '{"tier":"power","displayOrder":"4"}', '[]', '["1,800 messages per month","Up to 15 AI models","300 conversations per month","Advanced AI models","50 custom AI roles","Thread export","Access to all available flagship AI models"]', 1762330785000, 1762330821000);

-- ============================================================================
-- STRIPE PRICES
-- ============================================================================
-- Prices define the cost for each product
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

-- Starter Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1vEGx4IA5m8QeeZqGPlH7', 'prod_TMlR6It7OXeUFf', 1, 'usd', 2000, 'recurring', 'month', 1, NULL, '{"tier":"starter","billingPeriod":"monthly"}', 1762330708000, 1762330708000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1vVGx4IA5m8QeCZYtmiC6', 'prod_TMlR6It7OXeUFf', 1, 'usd', 20000, 'recurring', 'year', 1, NULL, '{"tier":"starter","billingPeriod":"annual","savingsPercent":"17"}', 1762330725000, 1762330725000);

-- Pro Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1w4Gx4IA5m8QeugZ8Ikeg', 'prod_TMlS4JgDD5IHGb', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"tier":"pro","billingPeriod":"monthly"}', 1762330760000, 1762330760000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1w9Gx4IA5m8QeUX4TWvqJ', 'prod_TMlS4JgDD5IHGb', 1, 'usd', 60000, 'recurring', 'year', 1, NULL, '{"tier":"pro","billingPeriod":"annual","savingsPercent":"15"}', 1762330765000, 1762330765000);

-- Power Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1weGx4IA5m8QeQlS9zmwE', 'prod_TMlTwCUfD1dwoC', 1, 'usd', 24900, 'recurring', 'month', 1, NULL, '{"tier":"power","billingPeriod":"monthly"}', 1762330796000, 1762330796000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ1wjGx4IA5m8QecpZfTAx4', 'prod_TMlTwCUfD1dwoC', 1, 'usd', 250000, 'recurring', 'year', 1, NULL, '{"tier":"power","billingPeriod":"annual","savingsPercent":"16"}', 1762330801000, 1762330801000);
