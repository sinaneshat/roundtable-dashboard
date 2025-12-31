/**
 * Utils Barrel Export
 *
 * Re-exports from utility modules for cleaner imports.
 */

// Helpers
export { getBaseUrl } from './helpers';

// Metadata utilities (SEO, JSON-LD, Next.js page metadata)
export { createBreadcrumbJsonLd, createFaqJsonLd, createJsonLd, createMetadata, type CreateMetadataProps } from './metadata';
