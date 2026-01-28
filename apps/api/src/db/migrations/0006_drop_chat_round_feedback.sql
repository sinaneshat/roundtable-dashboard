-- Drop chat_round_feedback table indexes first
DROP INDEX IF EXISTS `chat_round_feedback_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `chat_round_feedback_thread_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `chat_round_feedback_round_idx`;--> statement-breakpoint
-- Drop the chat_round_feedback table
DROP TABLE IF EXISTS `chat_round_feedback`;
