-- Database Seed File - PRODUCTION ENVIRONMENT
--
-- Environment: PRODUCTION (Live Mode)
-- Stripe Account: acct_1SPXN852vWNZ3v8w
-- Mode: LIVE MODE
--
-- URL: https://app.roundtable.now
-- ✅ CREDIT-BASED BILLING: Seeds credit plans and custom credit packages
-- ⚠️ NO BUSINESS LOGIC: All credit configs are in product-logic.service.ts
--
-- This file contains ONLY Stripe catalog data:
-- - Products (plans and credit packages)
-- - Prices (subscription and one-time prices)
-- - Product metadata (planType for identification)
--
-- Business rules (credit amounts, action costs, etc.) live in:
-- src/api/services/product-logic.service.ts (CREDIT_CONFIG)
--
-- Usage:
--   pnpm db:seed:prod

-- ============================================================================
-- STRIPE PRODUCTS - CREDIT-BASED PLANS (LIVE MODE)
-- ============================================================================
-- Free Plan: Connect card to get 10K credits, purchase more when needed
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_Tf8tvljsdhgeaH', 'Free', 'Connect your card to get 10,000 free credits. Purchase credit packs when you need more.', 1, 'price_1Shoc852vWNZ3v8wtrMKFJxe', '{"planType":"free","displayOrder":"1"}', '[]', '["Connect card to get 10K free credits","Purchase credit packs anytime","Limited model selection","Up to 5 threads","Basic support"]', 1766569436000, 1766569436000);

-- Pro Plan: $100/month, 1M credits
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_Tf8t3FTCKcpVDq', 'Pro', '1,000,000 credits per month with automatic renewal. Full access to all AI models.', 1, 'price_1Shoc952vWNZ3v8wCuBiKKIA', '{"planType":"paid","displayOrder":"2","badge":"most_popular"}', '[]', '["1,000,000 credits per month","Automatic monthly renewal","Unlimited AI models","Priority support"]', 1766569436000, 1766569436000);

-- Custom Credits: One-time purchases
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_Tf8ttpjBZtWGbe', 'Custom Credits', 'Purchase credits in any amount. Credits never expire.', 1, NULL, '{"planType":"custom","displayOrder":"3"}', '[]', '["Purchase any amount","Credits never expire","Volume discounts available"]', 1766569437000, 1766569437000);

-- ============================================================================
-- STRIPE PRICES - SUBSCRIPTION PLANS (LIVE MODE)
-- ============================================================================
-- Free Plan Price: $0/month
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1Shoc852vWNZ3v8wtrMKFJxe', 'prod_Tf8tvljsdhgeaH', 1, 'usd', 0, 'recurring', 'month', 1, NULL, '{"planType":"free"}', 1766569456000, 1766569456000);

-- Pro Plan Price: $100/month
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1Shoc952vWNZ3v8wCuBiKKIA', 'prod_Tf8t3FTCKcpVDq', 1, 'usd', 10000, 'recurring', 'month', 1, NULL, '{"planType":"paid"}', 1766569457000, 1766569457000);

-- Pro Plan Price: $1000/year (~17% savings vs monthly)
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1ShqYV52vWNZ3v8wB8G9Cy0X', 'prod_Tf8t3FTCKcpVDq', 1, 'usd', 100000, 'recurring', 'year', 1, NULL, '{"planType":"paid"}', 1766576919000, 1766576919000);

-- ============================================================================
-- STRIPE PRICES - CUSTOM CREDIT PACKAGES (LIVE MODE)
-- ============================================================================
-- $1 = 1,000 credits
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1Shoc952vWNZ3v8wGVhL81lr', 'prod_Tf8ttpjBZtWGbe', 1, 'usd', 100, 'one_time', NULL, NULL, NULL, '{"credits":"1000"}', 1766569457000, 1766569457000);

-- $10 = 10,000 credits
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1ShocZ52vWNZ3v8wJ2XEoviR', 'prod_Tf8ttpjBZtWGbe', 1, 'usd', 1000, 'one_time', NULL, NULL, NULL, '{"credits":"10000"}', 1766569483000, 1766569483000);

-- $50 = 50,000 credits
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1ShocZ52vWNZ3v8waD6wRNGa', 'prod_Tf8ttpjBZtWGbe', 1, 'usd', 5000, 'one_time', NULL, NULL, NULL, '{"credits":"50000"}', 1766569483000, 1766569483000);

-- $100 = 100,000 credits
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1Shoca52vWNZ3v8wO9HKh4Kq', 'prod_Tf8ttpjBZtWGbe', 1, 'usd', 10000, 'one_time', NULL, NULL, NULL, '{"credits":"100000"}', 1766569484000, 1766569484000);

-- $500 = 500,000 credits
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1Shocb52vWNZ3v8w1vlOjP9y', 'prod_Tf8ttpjBZtWGbe', 1, 'usd', 50000, 'one_time', NULL, NULL, NULL, '{"credits":"500000"}', 1766569485000, 1766569485000);
