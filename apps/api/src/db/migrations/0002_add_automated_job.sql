CREATE TABLE `automated_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text,
	`initial_prompt` text NOT NULL,
	`total_rounds` integer DEFAULT 3 NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`auto_publish` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`selected_models` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `automated_job_user_idx` ON `automated_job` (`user_id`);
--> statement-breakpoint
CREATE INDEX `automated_job_status_idx` ON `automated_job` (`status`);
--> statement-breakpoint
CREATE INDEX `automated_job_thread_idx` ON `automated_job` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `automated_job_created_idx` ON `automated_job` (`created_at`);
