/**
 * SEO Components Export
 *
 * Comprehensive SEO toolkit for 2025 AI search readiness
 *
 * Core Components:
 * - StructuredData: Base JSON-LD structured data
 * - BreadcrumbStructuredData: Navigation breadcrumbs
 * - FaqStructuredData: FAQ schema for rich results
 *
 * 2025 AI Search Components:
 * - SoftwareApplicationSchema: Enhanced app schema with SearchAction
 * - HowToSchema: Step-by-step tutorials (AI engines love this)
 * - VideoObjectSchema: Video content optimization
 * - ComparativeContentSchema: Comparison content (30% of AI citations)
 * - AeoMetaTags: Answer Engine Optimization meta tags
 *
 * Usage Example:
 * ```tsx
 * import {
 *   StructuredData,
 *   AeoMetaTags,
 *   SoftwareApplicationSchema
 * } from '@/components/seo';
 *
 * // In your page/layout
 * <StructuredData type="WebApplication" />
 * <SoftwareApplicationSchema />
 * <AeoMetaTags
 *   primaryQuestion="What is Roundtable?"
 *   primaryAnswer="An AI collaboration platform"
 *   contentType="guide"
 *   entities={['AI', 'collaboration', 'ChatGPT', 'Claude']}
 * />
 * ```
 */

export { AeoMetaTags } from './aeo-meta-tags';
export { BreadcrumbStructuredData } from './breadcrumb-structured-data';
export { ComparativeContentSchema } from './comparative-content-schema';
export { FaqStructuredData } from './faq-structured-data';
export { HowToSchema } from './how-to-schema';
export { SoftwareApplicationSchema } from './software-application-schema';
export { StructuredData } from './structured-data';
export { VideoObjectSchema } from './video-object-schema';
