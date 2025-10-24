-- Add unique constraint to prevent duplicate participants
-- This ensures only one participant per thread+model combination
-- Role is intentionally excluded to allow role changes without creating duplicates

-- Create partial unique index (only for enabled participants)
-- This allows soft-deleted (disabled) participants to exist without violating uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS chat_participant_thread_model_unique
ON chat_participant (thread_id, model_id)
WHERE is_enabled = 1;

-- Add index for performance on common queries
CREATE INDEX IF NOT EXISTS chat_participant_enabled_idx
ON chat_participant (thread_id, is_enabled)
WHERE is_enabled = 1;