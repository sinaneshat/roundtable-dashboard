/**
 * Database schema - All database tables
 * This file serves as the main entry point for all database tables
 */

// Auth tables
export * from './tables/auth';

// Billing tables (Stripe integration)
export * from './tables/billing';

// Chat tables (Multi-model AI chat)
export * from './tables/chat';

// Project tables (ChatGPT Projects-style knowledge bases)
export * from './tables/project';

// Upload tables (Centralized file storage with junction tables)
export * from './tables/upload';

// Usage tracking tables (Chat quotas and limits)
export * from './tables/usage';
