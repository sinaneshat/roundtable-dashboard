-- Remove variant columns from chat_message table
-- Migrate existing variant data to metadata before dropping columns
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_message` (
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
INSERT INTO `__new_chat_message`("id", "thread_id", "participant_id", "role", "content", "reasoning", "tool_calls", "metadata", "created_at")
SELECT
  "id",
  "thread_id",
  "participant_id",
  "role",
  "content",
  "reasoning",
  "tool_calls",
  -- Migrate variant data to metadata
  CASE
    WHEN "metadata" IS NULL THEN
      json_object(
        'variantIndex', "variant_index",
        'isActiveVariant', CASE WHEN "is_active_variant" = 1 THEN json('true') ELSE json('false') END,
        'parentMessageId', "parent_message_id"
      )
    ELSE
      json_patch(
        "metadata",
        json_object(
          'variantIndex', "variant_index",
          'isActiveVariant', CASE WHEN "is_active_variant" = 1 THEN json('true') ELSE json('false') END,
          'parentMessageId', "parent_message_id"
        )
      )
  END as "metadata",
  "created_at"
FROM `chat_message`;--> statement-breakpoint
DROP TABLE `chat_message`;--> statement-breakpoint
ALTER TABLE `__new_chat_message` RENAME TO `chat_message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_message_thread_idx` ON `chat_message` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_message_created_idx` ON `chat_message` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_message_participant_idx` ON `chat_message` (`participant_id`);