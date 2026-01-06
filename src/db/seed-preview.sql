-- PREVIEW ENVIRONMENT (Test Mode)
-- Stripe Account: acct_1SPXN852vWNZ3v8w
-- URL: https://app-preview.roundtable.now

-- Shared Seed Data - Stripe Product Catalog
INSERT OR IGNORE INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_TMletnsnfqVCHe', 'Pro', '100,000 credits per month with automatic renewal. Full access to all AI models.', 1, 'price_1SQ27952vWNZ3v8wLHORFzZw', '{"planType":"paid","displayOrder":"1","badge":"most_popular"}', '[]', '["100,000 credits per month","Automatic monthly renewal","Unlimited AI models","Priority support"]', 1735689600, 1735689600);

INSERT OR IGNORE INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SQ27952vWNZ3v8wLHORFzZw', 'prod_TMletnsnfqVCHe', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"planType":"paid"}', 1735689600, 1735689600);
