-- Migration: Deactivate non-instruction memories
-- Date: 2026-01-28
-- Description: As part of memory system simplification, deactivate all memories
-- that were auto-extracted from user messages. Only 'instruction' source memories
-- should remain active.

-- Deactivate all memories with source other than 'instruction'
UPDATE project_memory
SET is_active = 0,
    updated_at = unixepoch()
WHERE source != 'instruction' AND is_active = 1;
