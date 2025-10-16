/**
 * Open Graph Image Configuration for Public Chat Threads
 * Dynamic OG images based on thread content
 */
// Use Node.js runtime (compatible with OpenNext)
export const revalidate = 86400; // ISR: Revalidate every 24 hours (same as page)
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = 'Public AI Chat Thread';
