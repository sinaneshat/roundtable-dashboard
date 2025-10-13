PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_moderator_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`mode` text NOT NULL,
	`user_question` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`analysis_data` text,
	`participant_message_ids` text NOT NULL,
	`error_message` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- ✅ Migrate existing analyses as 'completed' since they have analysis_data populated
INSERT INTO `__new_chat_moderator_analysis`("id", "thread_id", "round_number", "mode", "user_question", "status", "analysis_data", "participant_message_ids", "error_message", "completed_at", "created_at")
SELECT "id", "thread_id", "round_number", "mode", "user_question", 'completed', "analysis_data", "participant_message_ids", NULL, "created_at", "created_at" FROM `chat_moderator_analysis`;--> statement-breakpoint
DROP TABLE `chat_moderator_analysis`;--> statement-breakpoint
ALTER TABLE `__new_chat_moderator_analysis` RENAME TO `chat_moderator_analysis`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_thread_idx` ON `chat_moderator_analysis` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_round_idx` ON `chat_moderator_analysis` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_created_idx` ON `chat_moderator_analysis` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_status_idx` ON `chat_moderator_analysis` (`status`);