---
name: "Specialized Agents Context"
description: "Overview of specialized Claude Code agents for the SaaS dashboard project"
---

# Specialized Agents Context

This directory contains specialized Claude Code agents optimized for the SaaS dashboard project.

## Agent Responsibilities & Chaining

### Active Agents

**backend-pattern-expert.md** - Hono + Cloudflare Workers + Drizzle ORM
- Database schema changes and Drizzle migrations
- API endpoint creation (route/handler/schema pattern)
- Authentication and session management (auth, system routes)
- Service layer implementation patterns
- Health check and monitoring endpoints

**frontend-ui-expert.md** - TanStack Start + shadcn/ui + TanStack Query
- Component creation following design system patterns
- TanStack Query implementation for data fetching (direct usage, no abstraction layer)
- Dashboard UI components and user flows (English-only with translation keys, dark theme)
- Responsive design and accessibility

**research-analyst.md** - Documentation and analysis
- API research and integration planning
- Technical documentation and best practices analysis
- Feature planning and requirements analysis

**i18n-translation-manager.md** - Translation key management (English-only)
- Translation key management in `/src/i18n/locales/en/common.json`
- Ensuring components use `useTranslations()` hooks - NO hardcoded strings allowed
- Maintaining consistent translation key naming conventions
- English-only application, but dynamic translation keys maintained for consistency and maintainability

## Common Agent Workflows

### Feature Development Chain
1. **Research Agent**: Analyzes requirements, APIs, and patterns
2. **Backend Agent**: Implements database schema and API endpoints
3. **Frontend Agent**: Creates UI components and data fetching
4. **i18n Agent**: Adds translation keys for any new user-facing text

### Bug Fix Chain
1. **Backend Agent**: Analyzes API/database issues
2. **Frontend Agent**: Investigates UI/data fetching problems
3. **Quality validation**: Runs lint and type-check

## Project-Specific Context

All agents are enhanced with:
- SaaS platform patterns (external service integration)
- English-only interface (translation keys maintained, single locale)
- Dark theme only (no theme switching)
- Cloudflare Workers deployment patterns
- Drizzle ORM with D1 database optimization

## Usage Examples

```bash
# Explicit agent invocation
> Use the backend-pattern-expert agent to add a new API endpoint
> Have the frontend-ui-expert agent create a dashboard component
> Ask the research-analyst agent to research best practices

# Automatic delegation based on task type
> Add a new API handler  # → backend-pattern-expert
> Create a dashboard component  # → frontend-ui-expert
> Research external API integration patterns  # → research-analyst
```

Agents automatically coordinate through shared project context and established patterns in CLAUDE.md.
