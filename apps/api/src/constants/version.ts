/**
 * Version Management
 *
 * Version is injected at build time via wrangler's --define flag.
 * Changesets automatically updates package.json versions based on commits.
 */

declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
