-- Migration: Change chat_thread.project_id FK from SET NULL to CASCADE
--
-- This migration changes the foreign key behavior so that when a project
-- is deleted, all associated threads are also deleted (cascade) instead
-- of having their project_id set to NULL.
--
-- IMPORTANT: This is a DESTRUCTIVE change. Deleting a project will now
-- delete all threads within that project.
--
-- SQLite requires table recreation to modify FK constraints.

-- Disable foreign key checks during migration
PRAGMA foreign_keys = OFF;
--> statement-breakpoint

-- Create new table with updated FK constraint
CREATE TABLE `chat_thread_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`previous_slug` text,
	`mode` text DEFAULT 'debating' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`is_ai_generated_title` integer DEFAULT false NOT NULL,
	`enable_web_search` integer DEFAULT false NOT NULL,
	`metadata` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`last_message_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `chat_project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Copy all data from old table to new table
INSERT INTO `chat_thread_new` SELECT * FROM `chat_thread`;
--> statement-breakpoint

-- Drop old table
DROP TABLE `chat_thread`;
--> statement-breakpoint

-- Rename new table to original name
ALTER TABLE `chat_thread_new` RENAME TO `chat_thread`;
--> statement-breakpoint

-- Recreate indexes
CREATE UNIQUE INDEX `chat_thread_slug_unique` ON `chat_thread` (`slug`);
--> statement-breakpoint
CREATE INDEX `chat_thread_user_idx` ON `chat_thread` (`user_id`);
--> statement-breakpoint
CREATE INDEX `chat_thread_project_idx` ON `chat_thread` (`project_id`);
--> statement-breakpoint
CREATE INDEX `chat_thread_status_idx` ON `chat_thread` (`status`);
--> statement-breakpoint
CREATE INDEX `chat_thread_updated_idx` ON `chat_thread` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `chat_thread_slug_idx` ON `chat_thread` (`slug`);
--> statement-breakpoint
CREATE INDEX `chat_thread_previous_slug_idx` ON `chat_thread` (`previous_slug`);
--> statement-breakpoint
CREATE INDEX `chat_thread_favorite_idx` ON `chat_thread` (`is_favorite`);
--> statement-breakpoint
CREATE INDEX `chat_thread_public_idx` ON `chat_thread` (`is_public`);
--> statement-breakpoint
CREATE INDEX `chat_thread_public_status_idx` ON `chat_thread` (`is_public`, `status`);
--> statement-breakpoint

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
