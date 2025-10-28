-- Clear all Next.js tag cache revalidations
-- This is run during build to ensure fresh start
DELETE FROM revalidations;
