CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`remaining` integer,
	`rate_limit_enabled` integer DEFAULT true NOT NULL,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer DEFAULT 0 NOT NULL,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_customer` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`default_payment_method_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_customer_user_id_unique` ON `stripe_customer` (`user_id`);--> statement-breakpoint
CREATE INDEX `stripe_customer_user_idx` ON `stripe_customer` (`user_id`);--> statement-breakpoint
CREATE TABLE `stripe_invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text,
	`status` text NOT NULL,
	`amount_due` integer NOT NULL,
	`amount_paid` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`hosted_invoice_url` text,
	`invoice_pdf` text,
	`paid` integer DEFAULT false NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `stripe_customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `stripe_subscription`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stripe_invoice_customer_idx` ON `stripe_invoice` (`customer_id`);--> statement-breakpoint
CREATE INDEX `stripe_invoice_subscription_idx` ON `stripe_invoice` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `stripe_invoice_status_idx` ON `stripe_invoice` (`status`);--> statement-breakpoint
CREATE TABLE `stripe_payment_method` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`type` text NOT NULL,
	`card_brand` text,
	`card_last4` text,
	`card_exp_month` integer,
	`card_exp_year` integer,
	`bank_name` text,
	`bank_last4` text,
	`is_default` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `stripe_customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_payment_method_customer_idx` ON `stripe_payment_method` (`customer_id`);--> statement-breakpoint
CREATE INDEX `stripe_payment_method_default_idx` ON `stripe_payment_method` (`is_default`);--> statement-breakpoint
CREATE TABLE `stripe_price` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`unit_amount` integer,
	`type` text DEFAULT 'recurring' NOT NULL,
	`interval` text,
	`interval_count` integer DEFAULT 1,
	`trial_period_days` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `stripe_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_price_product_idx` ON `stripe_price` (`product_id`);--> statement-breakpoint
CREATE INDEX `stripe_price_active_idx` ON `stripe_price` (`active`);--> statement-breakpoint
CREATE TABLE `stripe_product` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`default_price_id` text,
	`metadata` text,
	`images` text,
	`features` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stripe_product_active_idx` ON `stripe_product` (`active`);--> statement-breakpoint
CREATE TABLE `stripe_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`price_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`cancel_at` integer,
	`canceled_at` integer,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`trial_start` integer,
	`trial_end` integer,
	`ended_at` integer,
	`metadata` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `stripe_customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_id`) REFERENCES `stripe_price`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_subscription_customer_idx` ON `stripe_subscription` (`customer_id`);--> statement-breakpoint
CREATE INDEX `stripe_subscription_user_idx` ON `stripe_subscription` (`user_id`);--> statement-breakpoint
CREATE INDEX `stripe_subscription_status_idx` ON `stripe_subscription` (`status`);--> statement-breakpoint
CREATE INDEX `stripe_subscription_price_idx` ON `stripe_subscription` (`price_id`);--> statement-breakpoint
CREATE INDEX `stripe_subscription_user_status_idx` ON `stripe_subscription` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `stripe_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`api_version` text,
	`processed` integer DEFAULT false NOT NULL,
	`processing_error` text,
	`data` text,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `stripe_webhook_event_type_idx` ON `stripe_webhook_event` (`type`);--> statement-breakpoint
CREATE INDEX `stripe_webhook_event_processed_idx` ON `stripe_webhook_event` (`processed`);--> statement-breakpoint
CREATE TABLE `chat_custom_role` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_custom_role_user_idx` ON `chat_custom_role` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_custom_role_name_idx` ON `chat_custom_role` (`name`);--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`participant_id` text,
	`role` text DEFAULT 'assistant' NOT NULL,
	`parts` text NOT NULL,
	`round_number` integer DEFAULT 0 NOT NULL,
	`tool_calls` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `chat_participant`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_message_thread_idx` ON `chat_message` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_message_created_idx` ON `chat_message` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_message_participant_idx` ON `chat_message` (`participant_id`);--> statement-breakpoint
CREATE INDEX `chat_message_role_idx` ON `chat_message` (`role`);--> statement-breakpoint
CREATE INDEX `chat_message_thread_created_idx` ON `chat_message` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_message_thread_round_idx` ON `chat_message` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `chat_moderator_analysis` (
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
CREATE INDEX `chat_moderator_analysis_thread_idx` ON `chat_moderator_analysis` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_round_idx` ON `chat_moderator_analysis` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_created_idx` ON `chat_moderator_analysis` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_moderator_analysis_status_idx` ON `chat_moderator_analysis` (`status`);--> statement-breakpoint
CREATE TABLE `chat_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`model_id` text NOT NULL,
	`custom_role_id` text,
	`role` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`settings` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`custom_role_id`) REFERENCES `chat_custom_role`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_priority_non_negative" CHECK("chat_participant"."priority" >= 0)
);
--> statement-breakpoint
CREATE INDEX `chat_participant_thread_idx` ON `chat_participant` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_participant_priority_idx` ON `chat_participant` (`priority`);--> statement-breakpoint
CREATE INDEX `chat_participant_custom_role_idx` ON `chat_participant` (`custom_role_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_participant_thread_model_unique` ON `chat_participant` (`thread_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `chat_pre_search` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`user_query` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`search_data` text,
	`error_message` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_pre_search_thread_idx` ON `chat_pre_search` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_pre_search_round_idx` ON `chat_pre_search` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE INDEX `chat_pre_search_created_idx` ON `chat_pre_search` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_pre_search_status_idx` ON `chat_pre_search` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_pre_search_thread_round_unique` ON `chat_pre_search` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `chat_round_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`feedback_type` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_round_feedback_unique_idx` ON `chat_round_feedback` (`thread_id`,`user_id`,`round_number`);--> statement-breakpoint
CREATE INDEX `chat_round_feedback_thread_idx` ON `chat_round_feedback` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_round_feedback_round_idx` ON `chat_round_feedback` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `chat_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
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
	FOREIGN KEY (`project_id`) REFERENCES `chat_project`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_thread_slug_unique` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_user_idx` ON `chat_thread` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_project_idx` ON `chat_thread` (`project_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_status_idx` ON `chat_thread` (`status`);--> statement-breakpoint
CREATE INDEX `chat_thread_updated_idx` ON `chat_thread` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chat_thread_slug_idx` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_favorite_idx` ON `chat_thread` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `chat_thread_public_idx` ON `chat_thread` (`is_public`);--> statement-breakpoint
CREATE TABLE `chat_thread_changelog` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`round_number` integer DEFAULT 0 NOT NULL,
	`change_type` text NOT NULL,
	`change_summary` text NOT NULL,
	`change_data` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_thread_idx` ON `chat_thread_changelog` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_type_idx` ON `chat_thread_changelog` (`change_type`);--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_created_idx` ON `chat_thread_changelog` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_thread_round_idx` ON `chat_thread_changelog` (`thread_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `chat_project` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT 'blue',
	`custom_instructions` text,
	`autorag_instance_id` text,
	`r2_folder_prefix` text NOT NULL,
	`settings` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_project_user_idx` ON `chat_project` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_project_created_idx` ON `chat_project` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_project_name_idx` ON `chat_project` (`name`);--> statement-breakpoint
CREATE TABLE `project_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`index_status` text DEFAULT 'pending' NOT NULL,
	`rag_metadata` text,
	`added_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `chat_project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_attachment_project_idx` ON `project_attachment` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_attachment_upload_idx` ON `project_attachment` (`upload_id`);--> statement-breakpoint
CREATE INDEX `project_attachment_status_idx` ON `project_attachment` (`index_status`);--> statement-breakpoint
CREATE INDEX `project_attachment_added_by_idx` ON `project_attachment` (`added_by`);--> statement-breakpoint
CREATE INDEX `project_attachment_created_idx` ON `project_attachment` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_attachment_unique_idx` ON `project_attachment` (`project_id`,`upload_id`);--> statement-breakpoint
CREATE TABLE `project_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`source` text DEFAULT 'chat' NOT NULL,
	`source_thread_id` text,
	`source_round_number` integer,
	`importance` integer DEFAULT 5 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `chat_project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_memory_project_idx` ON `project_memory` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_memory_source_idx` ON `project_memory` (`source`);--> statement-breakpoint
CREATE INDEX `project_memory_thread_idx` ON `project_memory` (`source_thread_id`);--> statement-breakpoint
CREATE INDEX `project_memory_active_idx` ON `project_memory` (`is_active`);--> statement-breakpoint
CREATE INDEX `project_memory_importance_idx` ON `project_memory` (`importance`);--> statement-breakpoint
CREATE INDEX `project_memory_created_idx` ON `project_memory` (`created_at`);--> statement-breakpoint
CREATE INDEX `project_memory_project_active_importance_idx` ON `project_memory` (`project_id`,`is_active`,`importance`);--> statement-breakpoint
CREATE TABLE `message_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_upload_message_idx` ON `message_upload` (`message_id`);--> statement-breakpoint
CREATE INDEX `message_upload_upload_idx` ON `message_upload` (`upload_id`);--> statement-breakpoint
CREATE INDEX `message_upload_created_idx` ON `message_upload` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_upload_unique_idx` ON `message_upload` (`message_id`,`upload_id`);--> statement-breakpoint
CREATE TABLE `thread_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`context` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thread_upload_thread_idx` ON `thread_upload` (`thread_id`);--> statement-breakpoint
CREATE INDEX `thread_upload_upload_idx` ON `thread_upload` (`upload_id`);--> statement-breakpoint
CREATE INDEX `thread_upload_created_idx` ON `thread_upload` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_upload_unique_idx` ON `thread_upload` (`thread_id`,`upload_id`);--> statement-breakpoint
CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_r2_key_unique` ON `upload` (`r2_key`);--> statement-breakpoint
CREATE INDEX `upload_user_idx` ON `upload` (`user_id`);--> statement-breakpoint
CREATE INDEX `upload_status_idx` ON `upload` (`status`);--> statement-breakpoint
CREATE INDEX `upload_created_idx` ON `upload` (`created_at`);--> statement-breakpoint
CREATE INDEX `upload_r2_key_idx` ON `upload` (`r2_key`);--> statement-breakpoint
CREATE INDEX `upload_mime_type_idx` ON `upload` (`mime_type`);--> statement-breakpoint
CREATE TABLE `user_chat_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`threads_created` integer DEFAULT 0 NOT NULL,
	`messages_created` integer DEFAULT 0 NOT NULL,
	`custom_roles_created` integer DEFAULT 0 NOT NULL,
	`analysis_generated` integer DEFAULT 0 NOT NULL,
	`subscription_tier` text DEFAULT 'free' NOT NULL,
	`is_annual` integer DEFAULT false NOT NULL,
	`pending_tier_change` text,
	`pending_tier_is_annual` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_threads_non_negative" CHECK("user_chat_usage"."threads_created" >= 0),
	CONSTRAINT "check_messages_non_negative" CHECK("user_chat_usage"."messages_created" >= 0),
	CONSTRAINT "check_custom_roles_non_negative" CHECK("user_chat_usage"."custom_roles_created" >= 0),
	CONSTRAINT "check_analysis_non_negative" CHECK("user_chat_usage"."analysis_generated" >= 0),
	CONSTRAINT "check_version_positive" CHECK("user_chat_usage"."version" > 0),
	CONSTRAINT "check_period_order" CHECK("user_chat_usage"."current_period_end" > "user_chat_usage"."current_period_start")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_chat_usage_user_id_unique` ON `user_chat_usage` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_chat_usage_user_idx` ON `user_chat_usage` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_chat_usage_period_idx` ON `user_chat_usage` (`current_period_end`);--> statement-breakpoint
CREATE TABLE `user_chat_usage_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`threads_created` integer DEFAULT 0 NOT NULL,
	`messages_created` integer DEFAULT 0 NOT NULL,
	`custom_roles_created` integer DEFAULT 0 NOT NULL,
	`analysis_generated` integer DEFAULT 0 NOT NULL,
	`subscription_tier` text NOT NULL,
	`is_annual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_history_threads_non_negative" CHECK("user_chat_usage_history"."threads_created" >= 0),
	CONSTRAINT "check_history_messages_non_negative" CHECK("user_chat_usage_history"."messages_created" >= 0),
	CONSTRAINT "check_history_custom_roles_non_negative" CHECK("user_chat_usage_history"."custom_roles_created" >= 0),
	CONSTRAINT "check_history_analysis_non_negative" CHECK("user_chat_usage_history"."analysis_generated" >= 0),
	CONSTRAINT "check_history_period_order" CHECK("user_chat_usage_history"."period_end" > "user_chat_usage_history"."period_start")
);
--> statement-breakpoint
CREATE INDEX `user_chat_usage_history_user_idx` ON `user_chat_usage_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_chat_usage_history_period_idx` ON `user_chat_usage_history` (`period_start`,`period_end`);