-- Migration: Remove Session Tables, Add Thread Changelog
-- Replaces complex session tracking with simple changelog for configuration changes
-- This provides audit trail without the overhead of denormalized junction tables

-- 1. Drop session-related indexes first
DROP INDEX IF EXISTS `chat_message_session_idx`;
DROP INDEX IF EXISTS `chat_session_thread_idx`;
DROP INDEX IF EXISTS `chat_session_number_idx`;
DROP INDEX IF EXISTS `chat_session_mode_idx`;
DROP INDEX IF EXISTS `chat_session_participant_session_idx`;
DROP INDEX IF EXISTS `chat_session_participant_model_idx`;
DROP INDEX IF EXISTS `chat_session_participant_priority_idx`;
DROP INDEX IF EXISTS `chat_session_memory_session_idx`;
DROP INDEX IF EXISTS `chat_session_memory_memory_idx`;

-- 2. Remove session_id column from chat_message
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- First, create temporary table without session_id
CREATE TABLE `chat_message_new` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`participant_id` text,
	`role` text DEFAULT 'assistant' NOT NULL,
	`content` text NOT NULL,
	`reasoning` text,
	`tool_calls` text,
	`metadata` text,
	`parent_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `chat_participant`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint

-- Copy data from old table to new table
INSERT INTO `chat_message_new`
SELECT
	`id`,
	`thread_id`,
	`participant_id`,
	`role`,
	`content`,
	`reasoning`,
	`tool_calls`,
	`metadata`,
	`parent_message_id`,
	`created_at`
FROM `chat_message`;
--> statement-breakpoint

-- Drop old table
DROP TABLE `chat_message`;
--> statement-breakpoint

-- Rename new table to original name
ALTER TABLE `chat_message_new` RENAME TO `chat_message`;
--> statement-breakpoint

-- Recreate indexes for chat_message
CREATE INDEX `chat_message_thread_idx` ON `chat_message` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `chat_message_created_idx` ON `chat_message` (`created_at`);
--> statement-breakpoint
CREATE INDEX `chat_message_participant_idx` ON `chat_message` (`participant_id`);
--> statement-breakpoint

-- 3. Drop session tables (order matters due to foreign keys)
DROP TABLE IF EXISTS `chat_session_memory`;
--> statement-breakpoint
DROP TABLE IF EXISTS `chat_session_participant`;
--> statement-breakpoint
DROP TABLE IF EXISTS `chat_session`;
--> statement-breakpoint

-- 4. Create new chat_thread_changelog table
CREATE TABLE `chat_thread_changelog` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`change_type` text NOT NULL,
	`change_summary` text NOT NULL,
	`change_data` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 5. Create indexes for changelog queries
CREATE INDEX `chat_thread_changelog_thread_idx` ON `chat_thread_changelog` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_type_idx` ON `chat_thread_changelog` (`change_type`);
--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_created_idx` ON `chat_thread_changelog` (`created_at`);
