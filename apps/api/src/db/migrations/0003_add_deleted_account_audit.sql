-- Migration: Add deleted_account_audit table
-- Purpose: Track hashed emails of deleted accounts to prevent free round abuse

CREATE TABLE `deleted_account_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`deletion_count` integer DEFAULT 1 NOT NULL,
	`first_deleted_at` integer NOT NULL,
	`last_deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deleted_account_audit_email_hash_unique` ON `deleted_account_audit` (`email_hash`);
--> statement-breakpoint
CREATE INDEX `deleted_account_audit_email_hash_idx` ON `deleted_account_audit` (`email_hash`);
