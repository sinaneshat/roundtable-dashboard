-- PRODUCTION ENVIRONMENT (Live Mode)
-- Stripe Account: acct_1SPXN852vWNZ3v8w
-- URL: https://roundtable.now
--
-- LIVE mode IDs - must match actual Stripe LIVE catalog
-- Product: Pro (prod_Tm6uQ8p2TyzcaA) - $59/month
-- Price: price_1SoYgp52vWNZ3v8wGzxrv0NC

-- Stripe Product Catalog - Pro Plan Only
INSERT OR IGNORE INTO stripe_product (id, name, description, active, default_price_id, metadata, images, features, created_at, updated_at) VALUES
('prod_Tm6uQ8p2TyzcaA', 'Pro', '100,000 credits per month with automatic renewal. Full access to all AI models.', 1, 'price_1SoYgp52vWNZ3v8wGzxrv0NC', '{"planType":"paid","displayOrder":"1","badge":"most_popular"}', '[]', '["100,000 credits per month","Automatic monthly renewal","Unlimited AI models","Priority support"]', 1768176531, 1768176531);

INSERT OR IGNORE INTO stripe_price (id, product_id, active, currency, unit_amount, type, `interval`, interval_count, trial_period_days, metadata, created_at, updated_at) VALUES
('price_1SoYgp52vWNZ3v8wGzxrv0NC', 'prod_Tm6uQ8p2TyzcaA', 1, 'usd', 5900, 'recurring', 'month', 1, NULL, '{"planType":"paid"}', 1768176539, 1768176539);

-- ============================================================================
-- LEGACY PAID USERS - OG users from legacy platform
-- 13 users who get 1 month Pro plan (100K credits) as a thank-you
-- These users can sign in via magic link or Google OAuth
-- ============================================================================

-- User records (id, name, email, email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires)
INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires) VALUES
('legacy-user-001-anita-solati', 'Anita Solati', 'anita.solati@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-002-steven-mocarski', 'Steven Mocarski', 'steven.mocarski@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-003-behnia', 'Behnia', 'behnia1352@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-004-mohammad-nouri', 'Mohammad Nouri', 'sirmohammadnouri@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-005-bazizi', 'Bazizi', 'bazizi@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-006-davej', 'Dave J', 'davej.se@outlook.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-007-etajer', 'Etajer', 'etajer@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-008-golazad', 'Sh Golazad', 'sh.golazad@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-009-maryam-fahimnejad', 'Maryam Fahimnejad', 'maryam.fahimnejad@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-010-farid-mohamadi', 'Dr Farid Mohamadi', 'dr.farid.mohamadi.derm@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-011-nahal-ghorbi', 'Nahal Ghorbi', 'nahalghorbi@yahoo.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-012-omrani-sadeq', 'Omrani Sadeq', 'omranisadeq10@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL),
('legacy-user-013-mehrabadgroup', 'Mehrabadgroup', 'mehrabadgroup@gmail.com', 1, NULL, 1736640000, 1736640000, NULL, 0, NULL, NULL);

-- Account records for credential-based auth (allows magic link login)
-- (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) VALUES
('legacy-acct-001', 'legacy-user-001-anita-solati', 'credential', 'legacy-user-001-anita-solati', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-002', 'legacy-user-002-steven-mocarski', 'credential', 'legacy-user-002-steven-mocarski', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-003', 'legacy-user-003-behnia', 'credential', 'legacy-user-003-behnia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-004', 'legacy-user-004-mohammad-nouri', 'credential', 'legacy-user-004-mohammad-nouri', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-005', 'legacy-user-005-bazizi', 'credential', 'legacy-user-005-bazizi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-006', 'legacy-user-006-davej', 'credential', 'legacy-user-006-davej', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-007', 'legacy-user-007-etajer', 'credential', 'legacy-user-007-etajer', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-008', 'legacy-user-008-golazad', 'credential', 'legacy-user-008-golazad', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-009', 'legacy-user-009-maryam-fahimnejad', 'credential', 'legacy-user-009-maryam-fahimnejad', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-010', 'legacy-user-010-farid-mohamadi', 'credential', 'legacy-user-010-farid-mohamadi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-011', 'legacy-user-011-nahal-ghorbi', 'credential', 'legacy-user-011-nahal-ghorbi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-012', 'legacy-user-012-omrani-sadeq', 'credential', 'legacy-user-012-omrani-sadeq', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000),
('legacy-acct-013', 'legacy-user-013-mehrabadgroup', 'credential', 'legacy-user-013-mehrabadgroup', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1736640000, 1736640000);

-- Stripe Customer records
-- (id, user_id, email, name, default_payment_method_id, metadata, created_at, updated_at)
INSERT OR IGNORE INTO stripe_customer (id, user_id, email, name, default_payment_method_id, metadata, created_at, updated_at) VALUES
('cus_legacy_001', 'legacy-user-001-anita-solati', 'anita.solati@gmail.com', 'Anita Solati', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_002', 'legacy-user-002-steven-mocarski', 'steven.mocarski@gmail.com', 'Steven Mocarski', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_003', 'legacy-user-003-behnia', 'behnia1352@gmail.com', 'Behnia', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_004', 'legacy-user-004-mohammad-nouri', 'sirmohammadnouri@gmail.com', 'Mohammad Nouri', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_005', 'legacy-user-005-bazizi', 'bazizi@gmail.com', 'Bazizi', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_006', 'legacy-user-006-davej', 'davej.se@outlook.com', 'Dave J', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_007', 'legacy-user-007-etajer', 'etajer@gmail.com', 'Etajer', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_008', 'legacy-user-008-golazad', 'sh.golazad@gmail.com', 'Sh Golazad', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_009', 'legacy-user-009-maryam-fahimnejad', 'maryam.fahimnejad@gmail.com', 'Maryam Fahimnejad', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_010', 'legacy-user-010-farid-mohamadi', 'dr.farid.mohamadi.derm@gmail.com', 'Dr Farid Mohamadi', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_011', 'legacy-user-011-nahal-ghorbi', 'nahalghorbi@yahoo.com', 'Nahal Ghorbi', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_012', 'legacy-user-012-omrani-sadeq', 'omranisadeq10@gmail.com', 'Omrani Sadeq', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000),
('cus_legacy_013', 'legacy-user-013-mehrabadgroup', 'mehrabadgroup@gmail.com', 'Mehrabadgroup', NULL, '{"legacyUser":"true"}', 1736640000, 1736640000);

-- Stripe Subscription records (1 month active subscription)
-- current_period_start: Jan 12, 2026 (1736640000)
-- current_period_end: Feb 12, 2026 (1739318400)
-- (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, cancel_at, canceled_at, current_period_start, current_period_end, trial_start, trial_end, ended_at, metadata, version, created_at, updated_at)
INSERT OR IGNORE INTO stripe_subscription (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, cancel_at, canceled_at, current_period_start, current_period_end, trial_start, trial_end, ended_at, metadata, version, created_at, updated_at) VALUES
('sub_legacy_001', 'cus_legacy_001', 'legacy-user-001-anita-solati', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_002', 'cus_legacy_002', 'legacy-user-002-steven-mocarski', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_003', 'cus_legacy_003', 'legacy-user-003-behnia', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_004', 'cus_legacy_004', 'legacy-user-004-mohammad-nouri', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_005', 'cus_legacy_005', 'legacy-user-005-bazizi', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_006', 'cus_legacy_006', 'legacy-user-006-davej', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_007', 'cus_legacy_007', 'legacy-user-007-etajer', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_008', 'cus_legacy_008', 'legacy-user-008-golazad', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_009', 'cus_legacy_009', 'legacy-user-009-maryam-fahimnejad', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_010', 'cus_legacy_010', 'legacy-user-010-farid-mohamadi', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_011', 'cus_legacy_011', 'legacy-user-011-nahal-ghorbi', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_012', 'cus_legacy_012', 'legacy-user-012-omrani-sadeq', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000),
('sub_legacy_013', 'cus_legacy_013', 'legacy-user-013-mehrabadgroup', 'active', 'price_1SoYgp52vWNZ3v8wGzxrv0NC', 1, 1, 1739318400, NULL, 1736640000, 1739318400, NULL, NULL, NULL, '{"legacyGift":"1month"}', 1, 1736640000, 1736640000);

-- User Credit Balance records (paid plan with 100K credits)
-- next_refill_at: Feb 12, 2026 (1739318400)
-- (id, user_id, balance, reserved_credits, plan_type, monthly_credits, last_refill_at, next_refill_at, version, created_at, updated_at)
INSERT OR IGNORE INTO user_credit_balance (id, user_id, balance, reserved_credits, plan_type, monthly_credits, last_refill_at, next_refill_at, version, created_at, updated_at) VALUES
('credit-legacy-001', 'legacy-user-001-anita-solati', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-002', 'legacy-user-002-steven-mocarski', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-003', 'legacy-user-003-behnia', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-004', 'legacy-user-004-mohammad-nouri', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-005', 'legacy-user-005-bazizi', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-006', 'legacy-user-006-davej', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-007', 'legacy-user-007-etajer', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-008', 'legacy-user-008-golazad', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-009', 'legacy-user-009-maryam-fahimnejad', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-010', 'legacy-user-010-farid-mohamadi', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-011', 'legacy-user-011-nahal-ghorbi', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-012', 'legacy-user-012-omrani-sadeq', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000),
('credit-legacy-013', 'legacy-user-013-mehrabadgroup', 100000, 0, 'paid', 100000, 1736640000, 1739318400, 1, 1736640000, 1736640000);
