-- FULL DATABASE RESET SCRIPT
-- Deletes all data from all tables in correct dependency order
-- Run migrations and seeds after this script
--
-- WARNING: This permanently deletes all data! Use with caution.

-- Disable foreign key checks for bulk delete (SQLite)
PRAGMA foreign_keys = OFF;

-- ============================================================================
-- JUNCTION/REFERENCE TABLES (depend on multiple parent tables)
-- ============================================================================
DELETE FROM message_upload;
DELETE FROM thread_upload;
DELETE FROM project_attachment;

-- ============================================================================
-- CHAT DOMAIN (child to parent order)
-- ============================================================================
DELETE FROM chat_pre_search;
DELETE FROM chat_round_feedback;
DELETE FROM chat_thread_changelog;
DELETE FROM chat_message;
DELETE FROM chat_participant;
DELETE FROM chat_thread;
DELETE FROM chat_custom_role;
DELETE FROM chat_user_preset;

-- ============================================================================
-- PROJECT DOMAIN
-- ============================================================================
DELETE FROM project_memory;
DELETE FROM chat_project;

-- ============================================================================
-- UPLOAD DOMAIN
-- ============================================================================
DELETE FROM upload;

-- ============================================================================
-- USAGE/CREDITS DOMAIN
-- ============================================================================
DELETE FROM credit_transaction;
DELETE FROM user_credit_balance;
DELETE FROM user_chat_usage_history;
DELETE FROM user_chat_usage;

-- ============================================================================
-- BILLING/STRIPE DOMAIN (child to parent order)
-- ============================================================================
DELETE FROM stripe_webhook_event;
DELETE FROM stripe_invoice;
DELETE FROM stripe_payment_method;
DELETE FROM stripe_subscription;
DELETE FROM stripe_customer;
DELETE FROM stripe_price;
DELETE FROM stripe_product;

-- ============================================================================
-- AUTH DOMAIN (child to parent order)
-- ============================================================================
DELETE FROM api_key;
DELETE FROM account;
DELETE FROM session;
DELETE FROM verification;
DELETE FROM user;

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;

-- Verify all tables are empty
SELECT 'Reset complete. All tables should be empty.';
