-- ============================================================================
-- DROP ALL TABLES - Database Reset
-- ============================================================================
-- This script drops all user tables in the correct order to avoid foreign key
-- constraint violations. System tables (_cf_KV, d1_migrations, sqlite_sequence)
-- are preserved.
--
-- Order: Drop children first, then parents
-- ============================================================================

-- Chat-related tables (children first)
DROP TABLE IF EXISTS project_knowledge_file;
DROP TABLE IF EXISTS chat_project;
DROP TABLE IF EXISTS chat_moderator_analysis;
DROP TABLE IF EXISTS chat_round_feedback;
DROP TABLE IF EXISTS chat_message;
DROP TABLE IF EXISTS chat_participant;
DROP TABLE IF EXISTS chat_thread_changelog;
DROP TABLE IF EXISTS chat_thread;
DROP TABLE IF EXISTS chat_custom_role;

-- Stripe/Billing tables (children first)
DROP TABLE IF EXISTS stripe_invoice;
DROP TABLE IF EXISTS stripe_subscription;
DROP TABLE IF EXISTS stripe_payment_method;
DROP TABLE IF EXISTS stripe_webhook_event;
DROP TABLE IF EXISTS stripe_price;
DROP TABLE IF EXISTS stripe_product;
DROP TABLE IF EXISTS stripe_customer;

-- Usage tracking tables
DROP TABLE IF EXISTS user_chat_usage_history;
DROP TABLE IF EXISTS user_chat_usage;

-- Auth-related tables (children first)
DROP TABLE IF EXISTS api_key;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS verification;

-- User table (parent - drop last)
DROP TABLE IF EXISTS user;
