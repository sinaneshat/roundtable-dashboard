/**
 * Shared Operations Layer - Barrel Export
 *
 * Reusable handler operations shared across route handlers.
 * Contains ONLY functions - schemas belong in common/ or db/validation/.
 *
 * Distinct from:
 * - services/ - External integrations and complex business logic
 * - common/ - Low-level cross-cutting utilities + shared schemas
 * - middleware/ - Request/response interception
 */

export * from './cache';
export * from './ownership';
export * from './pagination';
export * from './queries';
export * from './transforms';
