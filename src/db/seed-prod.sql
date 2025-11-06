-- Database Seed File - PRODUCTION ENVIRONMENT
--
-- Environment: PRODUCTION (Live Mode)
-- Stripe Account: acct_1SPXN852vWNZ3v8w
-- Mode: LIVE MODE
-- URL: https://app.roundtable.now
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
--   pnpm db:seed:prod

-- ============================================================================
-- STRIPE PRODUCTS (LIVE MODE)
-- ============================================================================
-- Products represent what users can subscribe to
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMldwdM0XtdMdu', 'Starter', 'Budget-friendly AI models with enhanced performance', 1, 'price_1SQ26w52vWNZ3v8wqvfrhWy7', '{"tier":"starter","displayOrder":"2"}', '[]', '["150 messages per month","Up to 5 AI models","30 conversations per month","Advanced AI models","3 custom AI roles","Access to affordable, fast AI models"]', 1762331419000, 1762331420000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMletnsnfqVCHe', 'Pro', 'Professional-grade AI models with excellent quality', 1, 'price_1SQ27952vWNZ3v8wLHORFzZw', '{"tier":"pro","displayOrder":"3","badge":"most_popular"}', '[]', '["400 messages per month","Up to 7 AI models","75 conversations per month","Advanced AI models","10 custom AI roles","Thread export","Access to professional-grade AI models"]', 1762331436000, 1762331436000);

INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMleKOrv9NWYiF', 'Power', 'Flagship AI models with maximum capabilities', 1, 'price_1SQ27c52vWNZ3v8w2sJ2bNSC', '{"tier":"power","displayOrder":"4"}', '[]', '["1,800 messages per month","Up to 15 AI models","300 conversations per month","Advanced AI models","50 custom AI roles","Thread export","Access to all available flagship AI models"]', 1762331457000, 1762331457000);

-- ============================================================================
-- STRIPE PRICES (LIVE MODE)
-- ============================================================================
-- Prices define the cost for each product
-- metadata.tier links to SUBSCRIPTION_TIERS in product-logic.service.ts

-- Starter Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ26w52vWNZ3v8wqvfrhWy7', 'prod_TMldwdM0XtdMdu', 1, 'usd', 2000, 'recurring', 'month', 1, NULL, '{"tier":"starter","billingPeriod":"monthly"}', 1762331434000, 1762331434000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ26x52vWNZ3v8wJGIr5AX2', 'prod_TMldwdM0XtdMdu', 1, 'usd', 20000, 'recurring', 'year', 1, NULL, '{"tier":"starter","billingPeriod":"annual","savingsPercent":"17"}', 1762331435000, 1762331435000);

-- Pro Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ27952vWNZ3v8wLHORFzZw', 'prod_TMletnsnfqVCHe', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"tier":"pro","billingPeriod":"monthly"}', 1762331447000, 1762331447000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ27B52vWNZ3v8waLL4H9aJ', 'prod_TMletnsnfqVCHe', 1, 'usd', 60000, 'recurring', 'year', 1, NULL, '{"tier":"pro","billingPeriod":"annual","savingsPercent":"15"}', 1762331449000, 1762331449000);

-- Power Plan Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ27c52vWNZ3v8w2sJ2bNSC', 'prod_TMleKOrv9NWYiF', 1, 'usd', 24900, 'recurring', 'month', 1, NULL, '{"tier":"power","billingPeriod":"monthly"}', 1762331476000, 1762331476000);

INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ27c52vWNZ3v8wUKoT29SL', 'prod_TMleKOrv9NWYiF', 1, 'usd', 250000, 'recurring', 'year', 1, NULL, '{"tier":"power","billingPeriod":"annual","savingsPercent":"16"}', 1762331476000, 1762331476000);
