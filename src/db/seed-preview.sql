-- Database Seed File - PREVIEW ENVIRONMENT
--
-- Environment: LOCAL (Test Mode)
-- Stripe Account: acct_1SPXN852vWNZ3v8w
-- Mode: TEST MODE
--
-- URL: https://app-preview.roundtable.now
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
--   pnpm db:seed:preview

-- ============================================================================
-- STRIPE PRODUCTS (TEST MODE)
-- ============================================================================
-- Products represent what users can subscribe to
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TNDAWBXio4jN39', 'Starter', 'Budget-friendly AI models with enhanced performance', 1, 'price_1SQSlW52vWNZ3v8w29yjINF8', '{"tier":"starter","displayOrder":"2"}', '[]', '["150 messages per month","Up to 5 AI models","30 conversations per month","Advanced AI models","3 custom AI roles","Access to affordable, fast AI models"]', 1762433793000, 1762433894000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TNDCmd1s58T87M', 'Pro', 'Professional-grade AI models with excellent quality', 1, 'price_1SQSmT52vWNZ3v8wlCQHxdpA', '{"tier":"pro","displayOrder":"3","badge":"most_popular"}', '[]', '["400 messages per month","Up to 7 AI models","75 conversations per month","Advanced AI models","10 custom AI roles","Thread export","Access to professional-grade AI models"]', 1762433929000, 1762433953000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TNDCDIIJTWZ0NH', 'Power', 'Flagship AI models with maximum capabilities', 1, 'price_1SQSmY52vWNZ3v8w0Vi5JMjL', '{"tier":"power","displayOrder":"4"}', '[]', '["1,800 messages per month","Up to 15 AI models","300 conversations per month","Advanced AI models","50 custom AI roles","Thread export","Access to all available flagship AI models"]', 1762433934000, 1762433958000);

-- ============================================================================
-- STRIPE PRICES (TEST MODE)
-- ============================================================================
-- Prices define the cost for each product
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

-- Starter Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSlW52vWNZ3v8w29yjINF8', 'prod_TNDAWBXio4jN39', 1, 'usd', 2000, 'recurring', 'month', 1, NULL, '{"tier":"starter","billingPeriod":"monthly"}', 1762433894000, 1762433894000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSlZ52vWNZ3v8wJVBlu2cR', 'prod_TNDAWBXio4jN39', 1, 'usd', 20000, 'recurring', 'year', 1, NULL, '{"tier":"starter","billingPeriod":"annual","savingsPercent":"17"}', 1762433897000, 1762433897000);

-- Pro Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSmT52vWNZ3v8wlCQHxdpA', 'prod_TNDCmd1s58T87M', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"tier":"pro","billingPeriod":"monthly"}', 1762433953000, 1762433953000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSmU52vWNZ3v8wmvCWxnaE', 'prod_TNDCmd1s58T87M', 1, 'usd', 60000, 'recurring', 'year', 1, NULL, '{"tier":"pro","billingPeriod":"annual","savingsPercent":"15"}', 1762433954000, 1762433954000);

-- Power Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSmY52vWNZ3v8w0Vi5JMjL', 'prod_TNDCDIIJTWZ0NH', 1, 'usd', 24900, 'recurring', 'month', 1, NULL, '{"tier":"power","billingPeriod":"monthly"}', 1762433958000, 1762433958000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQSmZ52vWNZ3v8wDmh97nJH', 'prod_TNDCDIIJTWZ0NH', 1, 'usd', 250000, 'recurring', 'year', 1, NULL, '{"tier":"power","billingPeriod":"annual","savingsPercent":"16"}', 1762433959000, 1762433959000);
