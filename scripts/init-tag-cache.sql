-- Create revalidations table for Next.js/OpenNext tag cache
-- Schema must match @opennextjs/cloudflare d1-next-tag-cache expectations
-- Column name is camelCase (revalidatedAt) NOT snake_case

DROP TABLE IF EXISTS revalidations;

CREATE TABLE revalidations (
  tag TEXT PRIMARY KEY,
  revalidatedAt INTEGER NOT NULL
);

-- Index for faster time-based queries
CREATE INDEX IF NOT EXISTS idx_revalidatedAt ON revalidations(revalidatedAt);
