-- Migration: Session Tracking with Normalized Schema
-- Replaces sessionNumber and sessionMetadata with proper normalized tables
-- Following Drizzle ORM best practices for queryability and referential integrity

-- 1. Drop old session fields from chat_message (from migration 0001)
DROP INDEX IF EXISTS `chat_message_session_idx`;
ALTER TABLE `chat_message` DROP COLUMN `session_number`;
ALTER TABLE `chat_message` DROP COLUMN `session_metadata`;

-- 2. Create chat_session table (main session record)
CREATE TABLE `chat_session` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`session_number` integer NOT NULL,
	`mode` text NOT NULL,
	`user_prompt` text NOT NULL,
	`user_message_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 3. Create chat_session_participant junction table
CREATE TABLE `chat_session_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`model_id` text NOT NULL,
	`role` text,
	`priority` integer NOT NULL,
	`responded` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `chat_participant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 4. Create chat_session_memory junction table
CREATE TABLE `chat_session_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`memory_id` text NOT NULL,
	`memory_title` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memory_id`) REFERENCES `chat_memory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 5. Add session_id to chat_message
ALTER TABLE `chat_message` ADD `session_id` text REFERENCES `chat_session`(`id`) ON DELETE set null;
--> statement-breakpoint

-- 6. Create indexes for optimal query performance

-- Session table indexes
CREATE INDEX `chat_session_thread_idx` ON `chat_session` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `chat_session_number_idx` ON `chat_session` (`thread_id`,`session_number`);
--> statement-breakpoint
CREATE INDEX `chat_session_mode_idx` ON `chat_session` (`mode`);
--> statement-breakpoint

-- Session participant indexes
CREATE INDEX `chat_session_participant_session_idx` ON `chat_session_participant` (`session_id`);
--> statement-breakpoint
CREATE INDEX `chat_session_participant_model_idx` ON `chat_session_participant` (`model_id`);
--> statement-breakpoint
CREATE INDEX `chat_session_participant_priority_idx` ON `chat_session_participant` (`session_id`,`priority`);
--> statement-breakpoint

-- Session memory indexes
CREATE INDEX `chat_session_memory_session_idx` ON `chat_session_memory` (`session_id`);
--> statement-breakpoint

-- Message session index (for querying messages by session)
CREATE INDEX `chat_message_session_idx` ON `chat_message` (`session_id`);
