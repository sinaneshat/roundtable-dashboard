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
	`content` text NOT NULL,
	`reasoning` text,
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
	FOREIGN KEY (`custom_role_id`) REFERENCES `chat_custom_role`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_participant_thread_idx` ON `chat_participant` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_participant_priority_idx` ON `chat_participant` (`priority`);--> statement-breakpoint
CREATE INDEX `chat_participant_custom_role_idx` ON `chat_participant` (`custom_role_id`);--> statement-breakpoint
CREATE TABLE `chat_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`mode` text DEFAULT 'brainstorming' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`last_message_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_thread_slug_unique` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_user_idx` ON `chat_thread` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_status_idx` ON `chat_thread` (`status`);--> statement-breakpoint
CREATE INDEX `chat_thread_updated_idx` ON `chat_thread` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chat_thread_slug_idx` ON `chat_thread` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_thread_favorite_idx` ON `chat_thread` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `chat_thread_public_idx` ON `chat_thread` (`is_public`);--> statement-breakpoint
CREATE TABLE `chat_thread_changelog` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`change_type` text NOT NULL,
	`change_summary` text NOT NULL,
	`change_data` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_thread_idx` ON `chat_thread_changelog` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_type_idx` ON `chat_thread_changelog` (`change_type`);--> statement-breakpoint
CREATE INDEX `chat_thread_changelog_created_idx` ON `chat_thread_changelog` (`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_tier_quotas` (
	`id` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`is_annual` integer DEFAULT false NOT NULL,
	`threads_per_month` integer NOT NULL,
	`messages_per_month` integer NOT NULL,
	`custom_roles_per_month` integer DEFAULT 0 NOT NULL,
	`max_ai_models` integer DEFAULT 5 NOT NULL,
	`allow_custom_roles` integer DEFAULT false NOT NULL,
	`allow_thread_export` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscription_tier_quotas_tier_idx` ON `subscription_tier_quotas` (`tier`);--> statement-breakpoint
CREATE INDEX `subscription_tier_quotas_annual_idx` ON `subscription_tier_quotas` (`is_annual`);--> statement-breakpoint
CREATE INDEX `subscription_tier_quotas_tier_annual_unique_idx` ON `subscription_tier_quotas` (`tier`,`is_annual`);--> statement-breakpoint
CREATE TABLE `user_chat_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`threads_created` integer DEFAULT 0 NOT NULL,
	`threads_limit` integer NOT NULL,
	`messages_created` integer DEFAULT 0 NOT NULL,
	`messages_limit` integer NOT NULL,
	`custom_roles_created` integer DEFAULT 0 NOT NULL,
	`custom_roles_limit` integer NOT NULL,
	`subscription_tier` text DEFAULT 'free' NOT NULL,
	`is_annual` integer DEFAULT false NOT NULL,
	`pending_tier_change` text,
	`pending_tier_is_annual` integer,
	`pending_tier_price_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
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
	`threads_limit` integer NOT NULL,
	`messages_created` integer DEFAULT 0 NOT NULL,
	`messages_limit` integer NOT NULL,
	`custom_roles_created` integer DEFAULT 0 NOT NULL,
	`custom_roles_limit` integer NOT NULL,
	`subscription_tier` text NOT NULL,
	`is_annual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_chat_usage_history_user_idx` ON `user_chat_usage_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_chat_usage_history_period_idx` ON `user_chat_usage_history` (`period_start`,`period_end`);