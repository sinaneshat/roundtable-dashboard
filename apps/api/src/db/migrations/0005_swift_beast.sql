CREATE TABLE `round_execution` (
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`error_message` text,
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` integer,
	`moderator_completed_at` integer,
	`participants_completed` integer DEFAULT 0 NOT NULL,
	`participants_total` integer DEFAULT 0 NOT NULL,
	`pre_search_completed_at` integer,
	`round_number` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`thread_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_execution_thread_round_unique` ON `round_execution` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE INDEX `round_execution_status_idx` ON `round_execution` (`status`);--> statement-breakpoint
CREATE INDEX `round_execution_thread_idx` ON `round_execution` (`thread_id`);--> statement-breakpoint
CREATE INDEX `round_execution_user_idx` ON `round_execution` (`user_id`);--> statement-breakpoint
CREATE INDEX `round_execution_recovery_idx` ON `round_execution` (`status`,`last_attempt_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_thread` (
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`enable_web_search` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_ai_generated_title` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`last_message_at` integer,
	`metadata` text,
	`mode` text DEFAULT 'debating' NOT NULL,
	`previous_slug` text,
	`project_id` text,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `chat_project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chat_thread`("created_at", "enable_web_search", "id", "is_ai_generated_title", "is_favorite", "is_public", "last_message_at", "metadata", "mode", "previous_slug", "project_id", "slug", "status", "title", "updated_at", "user_id", "version") SELECT "created_at", "enable_web_search", "id", "is_ai_generated_title", "is_favorite", "is_public", "last_message_at", "metadata", "mode", "previous_slug", "project_id", "slug", "status", "title", "updated_at", "user_id", "version" FROM `chat_thread`;--> statement-breakpoint
DROP TABLE `chat_thread`;--> statement-breakpoint
ALTER TABLE `__new_chat_thread` RENAME TO `chat_thread`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_thread_slug_unique` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_user_idx` ON `chat_thread` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_project_idx` ON `chat_thread` (`project_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_status_idx` ON `chat_thread` (`status`);--> statement-breakpoint
CREATE INDEX `chat_thread_updated_idx` ON `chat_thread` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chat_thread_slug_idx` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_previous_slug_idx` ON `chat_thread` (`previous_slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_favorite_idx` ON `chat_thread` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `chat_thread_public_idx` ON `chat_thread` (`is_public`);--> statement-breakpoint
CREATE INDEX `chat_thread_public_status_idx` ON `chat_thread` (`is_public`,`status`);