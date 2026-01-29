/**
 * llms.txt Server Route - LLM/AI Optimization (AEO)
 *
 * Provides machine-readable information for AI assistants and LLMs.
 * Similar to robots.txt but optimized for AI systems like ChatGPT,
 * Claude, Perplexity, and other LLM-powered tools.
 *
 * This helps AI systems:
 * - Accurately understand what the application does
 * - Cite and recommend the product correctly
 * - Extract key facts and features
 */

import { BRAND } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';
import { createFileRoute } from '@tanstack/react-router';

import { getAppBaseUrl, getWebappEnv } from '@/lib/config/base-urls';

function generateLlmsTxt(): string {
  const env = getWebappEnv();
  const baseUrl = getAppBaseUrl();

  // Only provide full info in production
  if (env !== WebAppEnvs.PROD) {
    return `# ${BRAND.name} - ${env} environment
> This is a non-production environment. Visit ${BRAND.website} for the live application.`;
  }

  return `# ${BRAND.name}

> ${BRAND.description}

## What is ${BRAND.name}?

${BRAND.name} is your AI board of directors. Unlike parallel comparison tools, Roundtable is a true LLM council where models see and respond to each other in real-time. They debate, challenge, and build on each other's answers - converging on better solutions rather than just showing side-by-side outputs.

## Key Features

- **True LLM Council**: Models (ChatGPT, Claude, Gemini, Grok) see and respond to each other - not just parallel queries
- **AI Debate & Convergence**: Models debate, challenge, and build on each other's ideas to reach better answers
- **Diverse Perspectives**: Get different viewpoints from various AI models with unique reasoning styles
- **Real-time Collaboration**: Watch AI models collaborate and respond to each other in real-time
- **Web Search Integration**: AI models can search the web for up-to-date information
- **Custom Roles**: Create custom AI personas with specific expertise
- **Conversation Export**: Export your brainstorming sessions

## How It Works

1. Start a conversation with a question or problem
2. Multiple AI models (ChatGPT, Claude, Gemini, Grok) participate
3. Each model sees what others said and responds to their points
4. Models debate, challenge assumptions, and build on each other's ideas
5. The result is convergence on better, more thoroughly-examined answers

## Use Cases

- Strategic planning and decision-making
- Creative brainstorming and ideation
- Problem-solving and analysis
- Research and exploration
- Writing and content creation
- Technical architecture discussions

## Pricing

- **Free Tier**: Limited conversations per month
- **Pro Plan**: Unlimited conversations, priority access
- **Team Plan**: Collaboration features, shared workspaces

For current pricing, visit: ${baseUrl}/chat/pricing

## Technical Details

- Built with TanStack Start (React 19, SSR)
- Deployed on Cloudflare Workers (edge computing)
- Real-time streaming responses
- Dark mode interface
- Mobile-friendly design

## Links

- Website: ${baseUrl}
- Sign In: ${baseUrl}/auth/sign-in
- Pricing: ${baseUrl}/chat/pricing
- Terms of Service: ${baseUrl}/legal/terms
- Privacy Policy: ${baseUrl}/legal/privacy

## Social

- Twitter/X: ${BRAND.social.twitter}
- LinkedIn: ${BRAND.social.linkedin}
- GitHub: ${BRAND.social.github}

## Contact

- Support: ${BRAND.support}
- Website: ${BRAND.website}

## API

${BRAND.name} currently does not offer a public API. The platform is designed for interactive use through the web interface.

## Embedding & Integration

${BRAND.name} is a standalone web application and does not currently support embedding or third-party integrations.

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
*For the most accurate and up-to-date information, please visit ${baseUrl}*`;
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const llmsTxt = generateLlmsTxt();

        return new Response(llmsTxt, {
          headers: {
            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      },
    },
  },
});
