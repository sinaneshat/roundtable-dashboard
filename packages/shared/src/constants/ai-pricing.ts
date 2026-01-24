/**
 * AI Provider Pricing Constants
 *
 * Actual provider costs (what you pay) for PostHog analytics.
 * Separate from user credit pricing (with markup).
 *
 * Prices are in USD per million tokens.
 */

/**
 * Cloudflare Workers AI pricing
 * @see https://developers.cloudflare.com/workers-ai/platform/pricing/
 */
export const CLOUDFLARE_AI_PRICING = {
  'llama-3.1-8b-instruct': {
    input: 0.282, // $ per million input tokens
    output: 0.827, // $ per million output tokens
  },
  'bge-base-en-v1.5': {
    input: 0.067, // $ per million tokens (embedding)
    output: 0, // embeddings don't have output cost
  },
} as const;

/**
 * Cloudflare AI Search pricing (AutoRAG)
 * Currently free during beta
 * @see https://developers.cloudflare.com/ai-search/platform/limits-pricing/
 */
export const CLOUDFLARE_AI_SEARCH_COST_PER_QUERY = 0;

/**
 * Tavily web search pricing (approximate)
 * ~$0.01 per search for basic tier
 */
export const TAVILY_COST_PER_SEARCH = 0.01;

/**
 * Helper to get Cloudflare AI pricing by model name
 */
export function getCloudflareAiPricing(
  modelName: keyof typeof CLOUDFLARE_AI_PRICING,
): { input: number; output: number } | undefined {
  return CLOUDFLARE_AI_PRICING[modelName];
}
