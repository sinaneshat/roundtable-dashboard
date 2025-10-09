-- Migration: Add message variants support for regeneration and branching
-- Adds variant_index and is_active_variant columns to chat_message table

-- SQLite doesn't support adding columns with constraints easily, so we recreate the table
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
	`variant_index` integer DEFAULT 0 NOT NULL,
	`is_active_variant` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `chat_participant`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE set null
);

-- Copy existing data to new table (all existing messages are variant 0 and active)
INSERT INTO `chat_message_new` (
	`id`,
	`thread_id`,
	`participant_id`,
	`role`,
	`content`,
	`reasoning`,
	`tool_calls`,
	`metadata`,
	`parent_message_id`,
	`variant_index`,
	`is_active_variant`,
	`created_at`
)
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
	0 as `variant_index`,
	1 as `is_active_variant`,
	`created_at`
FROM `chat_message`;

-- Drop old table
DROP TABLE `chat_message`;

-- Rename new table to original name
ALTER TABLE `chat_message_new` RENAME TO `chat_message`;

-- Recreate all indexes
CREATE INDEX `chat_message_thread_idx` ON `chat_message` (`thread_id`);
CREATE INDEX `chat_message_created_idx` ON `chat_message` (`created_at`);
CREATE INDEX `chat_message_participant_idx` ON `chat_message` (`participant_id`);
CREATE INDEX `chat_message_parent_idx` ON `chat_message` (`parent_message_id`);
CREATE INDEX `chat_message_variant_idx` ON `chat_message` (`parent_message_id`,`variant_index`);
