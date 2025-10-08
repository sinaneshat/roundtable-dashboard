ALTER TABLE `chat_message` ADD `session_number` integer;--> statement-breakpoint
ALTER TABLE `chat_message` ADD `session_metadata` text;--> statement-breakpoint
CREATE INDEX `chat_message_session_idx` ON `chat_message` (`thread_id`,`session_number`);