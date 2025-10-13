-- Database Seed File
--
-- Seeds the database with essential data:
-- - Subscription tier quotas (free, starter, pro, power)
-- - Stripe products and prices
--
-- 🚨 IMPORTANT: These values MUST match SUBSCRIPTION_TIER_CONFIG in src/lib/ai/models-config.ts
-- The TypeScript configuration is the SINGLE SOURCE OF TRUTH
-- Update both files together to maintain consistency
--
-- Usage:
--   Local:   pnpm db:seed:local
--   Preview: pnpm db:seed:preview
--   Prod:    pnpm db:seed:prod

-- Subscription Tier Quotas
-- ✅ Updated to match pricing plan screenshot and SUBSCRIPTION_TIER_CONFIG (src/lib/ai/models-config.ts)
-- Free: 2 conversations, 20 messages, 5 AI models (free models only)
-- Starter: 30 conversations, 150 messages, 5 AI models (up to $1/1M tokens)
-- Pro: 75 conversations, 400 messages, 7 AI models (up to $20/1M tokens)
-- Power: 300 conversations, 1,800 messages, 15 AI models (all models)
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SQMZ8AH1J08DDS794H', 'free', 0, 2, 20, 0, 5, 0, 0, '{"description":"Free models only (cost = $0)","displayOrder":"1"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SRVKJ92B3PT69BW83V', 'starter', 0, 30, 150, 3, 5, 1, 0, '{"description":"Budget models up to $1/1M tokens (Gemini Flash, Claude Haiku)","displayOrder":"2","stripeProductId":"prod_TAbABj98toEKg7"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SRGMF6J67SJZCF401Q', 'starter', 1, 30, 150, 3, 5, 1, 0, '{"description":"Budget models up to $1/1M tokens (annual billing)","displayOrder":"2","stripeProductId":"prod_TAbABj98toEKg7"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SRFNSJNKBSTSK22Q3H', 'pro', 0, 75, 400, 10, 7, 1, 1, '{"description":"Standard models up to $20/1M tokens (GPT-4o, Claude Sonnet)","displayOrder":"3","badge":"most_popular","stripeProductId":"prod_TAbATZPEiE2y9o"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SRMC9Q3JHHQHY957XC', 'pro', 1, 75, 400, 10, 7, 1, 1, '{"description":"Standard models up to $20/1M tokens (annual billing)","displayOrder":"3","badge":"most_popular","stripeProductId":"prod_TAbATZPEiE2y9o"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SRJCR0QV3WJ4FRYZ2G', 'power', 0, 300, 1800, 50, 15, 1, 1, '{"description":"All premium models (Claude Opus, GPT-4 Turbo, O1)","displayOrder":"4","stripeProductId":"prod_TAbA8kAHcag3Kb"}', 1759761697591, 1759761697591);
INSERT INTO subscription_tier_quotas (id, tier, is_annual, threads_per_month, messages_per_month, custom_roles_per_month, max_ai_models, allow_custom_roles, allow_thread_export, metadata, created_at, updated_at) VALUES ('01K6WZH2SR2MCCWPDJ0MDZNT5Q', 'power', 1, 300, 1800, 50, 15, 1, 1, '{"description":"All premium models (annual billing)","displayOrder":"4","stripeProductId":"prod_TAbA8kAHcag3Kb"}', 1759761697591, 1759761697591);

-- Stripe Products (synced with SUBSCRIPTION_TIER_CONFIG and pricing plan screenshot)
-- ✅ Updated to match new quotas and model access tiers
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES ('prod_TAbABj98toEKg7', 'Starter', 'Budget-friendly AI models with enhanced performance', 1, 'price_1SEFyVGx4IA5m8Qe8Wo4WGYK', '{"tier":"starter","displayOrder":"2"}', '[]', '["150 messages per month","Up to 5 AI models","30 conversations per month","Advanced AI models","3 custom AI roles","Access to Gemini Flash, Claude Haiku, Llama"]', 1759761697591, 1759761697591);
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES ('prod_TAbATZPEiE2y9o', 'Pro', 'Professional-grade AI models with excellent quality', 1, 'price_1SEFyWGx4IA5m8QesQBukr4b', '{"tier":"pro","displayOrder":"3","badge":"most_popular"}', '[]', '["400 messages per month","Up to 7 AI models","75 conversations per month","Advanced AI models","10 custom AI roles","Thread export","Access to GPT-4o, Claude Sonnet 3.5, Gemini Pro"]', 1759761697591, 1759761697591);
INSERT INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES ('prod_TAbA8kAHcag3Kb', 'Power', 'Flagship AI models with maximum capabilities', 1, 'price_1SEFyYGx4IA5m8QeXhso3m35', '{"tier":"power","displayOrder":"4"}', '[]', '["1,800 messages per month","Up to 15 AI models","300 conversations per month","Advanced AI models","50 custom AI roles","Thread export","Access to Claude Opus, GPT-4 Turbo, O1-Preview"]', 1759761697591, 1759761697591);

-- Stripe Prices
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyVGx4IA5m8Qe8Wo4WGYK', 'prod_TAbABj98toEKg7', 1, 'usd', 2000, 'recurring', 'month', 1, NULL, '{"tier":"starter","billingPeriod":"monthly"}', 1759761697591, 1759761697591);
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyVGx4IA5m8QevBWdcRom', 'prod_TAbABj98toEKg7', 1, 'usd', 20000, 'recurring', 'year', 1, NULL, '{"tier":"starter","billingPeriod":"annual","savingsPercent":"17"}', 1759761697591, 1759761697591);
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyWGx4IA5m8QesQBukr4b', 'prod_TAbATZPEiE2y9o', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"tier":"pro","billingPeriod":"monthly"}', 1759761697591, 1759761697591);
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyXGx4IA5m8QeM8s6Iu54', 'prod_TAbATZPEiE2y9o', 1, 'usd', 60000, 'recurring', 'year', 1, NULL, '{"tier":"pro","billingPeriod":"annual","savingsPercent":"15"}', 1759761697591, 1759761697591);
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyYGx4IA5m8QeXhso3m35', 'prod_TAbA8kAHcag3Kb', 1, 'usd', 24900, 'recurring', 'month', 1, NULL, '{"tier":"power","billingPeriod":"monthly"}', 1759761697591, 1759761697591);
INSERT INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES ('price_1SEFyYGx4IA5m8Qeukamf1lQ', 'prod_TAbA8kAHcag3Kb', 1, 'usd', 250000, 'recurring', 'year', 1, NULL, '{"tier":"power","billingPeriod":"annual","savingsPercent":"16"}', 1759761697591, 1759761697591);
