ALTER TABLE `user_chat_usage` ADD `pending_tier_change` text;--> statement-breakpoint
ALTER TABLE `user_chat_usage` ADD `pending_tier_is_annual` integer;--> statement-breakpoint
ALTER TABLE `user_chat_usage` ADD `pending_tier_price_id` text;